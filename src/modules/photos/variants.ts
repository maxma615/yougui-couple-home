import { AppError } from "@/lib/errors";

export type PhotoVariantCacheOptions = {
  maxBytes?: number;
  maxEntries?: number;
  maxConcurrentGenerations?: number;
  maxQueuedGenerations?: number;
};

type CacheEntry = { data: Buffer; bytes: number };

/** A process-local LRU for derived image responses; originals remain in the attachment store. */
export class PhotoVariantCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<Buffer>>();
  private readonly waiters: Array<() => void> = [];
  private bytes = 0;
  private activeGenerations = 0;
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly maxConcurrentGenerations: number;
  private readonly maxQueuedGenerations: number;

  constructor(options: PhotoVariantCacheOptions = {}) {
    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
    this.maxEntries = options.maxEntries ?? 128;
    this.maxConcurrentGenerations = options.maxConcurrentGenerations ?? 1;
    this.maxQueuedGenerations = options.maxQueuedGenerations ?? 8;
  }

  async getOrCreate(key: string, create: () => Promise<Buffer>): Promise<Buffer> {
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.data;
    }

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const pending = this.withGenerationSlot(create);
    this.inFlight.set(key, pending);
    try {
      const data = await pending;
      if (data.byteLength <= this.maxBytes && this.maxEntries > 0) {
        while (
          this.entries.size >= this.maxEntries ||
          this.bytes + data.byteLength > this.maxBytes
        ) {
          const oldest = this.entries.entries().next().value as [string, CacheEntry] | undefined;
          if (!oldest) break;
          this.entries.delete(oldest[0]);
          this.bytes -= oldest[1].bytes;
        }
        this.entries.set(key, { data, bytes: data.byteLength });
        this.bytes += data.byteLength;
      }
      return data;
    } finally {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    }
  }

  getStats(): { entries: number; bytes: number; inFlight: number; active: number; queued: number } {
    return {
      entries: this.entries.size,
      bytes: this.bytes,
      inFlight: this.inFlight.size,
      active: this.activeGenerations,
      queued: this.waiters.length,
    };
  }

  private async withGenerationSlot(create: () => Promise<Buffer>): Promise<Buffer> {
    if (this.activeGenerations >= this.maxConcurrentGenerations) {
      if (this.waiters.length >= this.maxQueuedGenerations) {
        throw new AppError(503, "PHOTO_VARIANTS_BUSY", "照片正在优化，请稍后重试");
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    } else {
      this.activeGenerations += 1;
    }

    try {
      return await create();
    } finally {
      const next = this.waiters.shift();
      if (next) {
        // Keep this slot counted as active until the selected waiter resumes.
        // Decrementing first opens a microtask-sized gap for a fresh request.
        next();
      } else {
        this.activeGenerations -= 1;
      }
    }
  }
}

export const photoVariantCache = new PhotoVariantCache();
