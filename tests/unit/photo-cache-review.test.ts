import { describe, expect, it } from "vitest";

import { PhotoVariantCache } from "../../src/modules/photos/variants";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("photo variant generation slot handoff", () => {
  it("does not let a fresh microtask jump ahead of an already queued transform", async () => {
    const cache = new PhotoVariantCache({ maxConcurrentGenerations: 1, maxQueuedGenerations: 4 });
    const firstGate = deferred<Buffer>();
    const secondGate = deferred<Buffer>();
    const thirdGate = deferred<Buffer>();
    const secondStarted = deferred<void>();
    const thirdStarted = deferred<void>();
    let activeTransforms = 0;
    let peakTransforms = 0;
    const hold = (gate: Promise<Buffer>, started: (() => void) | undefined = undefined) => {
      activeTransforms += 1;
      peakTransforms = Math.max(peakTransforms, activeTransforms);
      started?.();
      return gate.finally(() => {
        activeTransforms -= 1;
      });
    };

    const first = cache.getOrCreate("first", () => {
      activeTransforms += 1;
      peakTransforms = Math.max(peakTransforms, activeTransforms);
      return firstGate.promise;
    });
    const second = cache.getOrCreate("second", () => hold(secondGate.promise, () => secondStarted.resolve(undefined)));
    let third!: Promise<Buffer>;

    // Resolving this raw transform schedules the cache's await continuation first.
    // The fresh request is queued behind that continuation but ahead of its waiter.
    activeTransforms -= 1;
    firstGate.resolve(Buffer.from("first"));
    queueMicrotask(() => {
      third = cache.getOrCreate("third", () => hold(thirdGate.promise, () => thirdStarted.resolve(undefined)));
    });

    await secondStarted.promise;
    const observedPeak = peakTransforms;
    secondGate.resolve(Buffer.from("second"));
    thirdGate.resolve(Buffer.from("third"));
    await Promise.all([first, second, third]);

    expect(observedPeak).toBe(1);
    expect(cache.getStats()).toMatchObject({ active: 0, queued: 0, inFlight: 0 });
    await expect(thirdStarted.promise).resolves.toBeUndefined();
  });

  it("never exceeds the configured concurrency during a queued burst", async () => {
    const cache = new PhotoVariantCache({ maxConcurrentGenerations: 2, maxQueuedGenerations: 32 });
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        cache.getOrCreate(`variant-${index}`, async () => {
          active += 1;
          peak = Math.max(peak, active);
          try {
            await new Promise((resolve) => setTimeout(resolve, 0));
            return Buffer.from(String(index));
          } finally {
            active -= 1;
          }
        }),
      ),
    );

    expect(peak).toBe(2);
    expect(cache.getStats()).toMatchObject({ active: 0, queued: 0, inFlight: 0 });
  });
});
