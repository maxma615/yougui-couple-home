import { describe, expect, it } from "vitest";

import { PhotoVariantCache } from "../../src/modules/photos/variants";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("photo variant cache", () => {
  it("coalesces concurrent generation for the same variant", async () => {
    const cache = new PhotoVariantCache();
    const result = deferred<Buffer>();
    let calls = 0;
    const create = () => {
      calls += 1;
      return result.promise;
    };

    const first = cache.getOrCreate("same", create);
    const second = cache.getOrCreate("same", create);
    expect(calls).toBe(1);
    result.resolve(Buffer.from("webp"));

    await expect(Promise.all([first, second])).resolves.toEqual([
      Buffer.from("webp"),
      Buffer.from("webp"),
    ]);
    expect(cache.getStats()).toMatchObject({ entries: 1, bytes: 4, inFlight: 0, active: 0 });
  });

  it("keeps byte and entry limits while evicting the least recently used variant", async () => {
    const cache = new PhotoVariantCache({ maxBytes: 5, maxEntries: 2 });
    await cache.getOrCreate("a", async () => Buffer.from("aaa"));
    await cache.getOrCreate("b", async () => Buffer.from("bb"));
    await cache.getOrCreate("a", async () => Buffer.from("unused"));
    await cache.getOrCreate("c", async () => Buffer.from("cc"));

    let recreatedB = false;
    await cache.getOrCreate("b", async () => {
      recreatedB = true;
      return Buffer.from("bb");
    });

    expect(recreatedB).toBe(true);
    expect(cache.getStats().entries).toBeLessThanOrEqual(2);
    expect(cache.getStats().bytes).toBeLessThanOrEqual(5);
  });

  it("bounds distinct concurrent transforms and queued work", async () => {
    const cache = new PhotoVariantCache({ maxConcurrentGenerations: 1, maxQueuedGenerations: 1 });
    const firstResult = deferred<Buffer>();
    const first = cache.getOrCreate("first", () => firstResult.promise);
    const second = cache.getOrCreate("second", async () => Buffer.from("second"));
    await Promise.resolve();

    await expect(cache.getOrCreate("third", async () => Buffer.from("third"))).rejects.toMatchObject({
      status: 503,
      code: "PHOTO_VARIANTS_BUSY",
    });
    expect(cache.getStats()).toMatchObject({ active: 1, queued: 1 });

    firstResult.resolve(Buffer.from("first"));
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(cache.getStats()).toMatchObject({ active: 0, queued: 0, inFlight: 0 });
  });
});
