// Concurrency limiter with FIFO queue: at most `max` tasks run at once.
//
// Slot ownership uses a handoff pattern: when a task finishes, it either
// transfers its slot directly to the next queued waiter (active stays the
// same) or, if the queue is empty, decrements active. This eliminates a
// theoretical race where a synchronous caller could observe `active < max`
// in the window between resolving a waiter's promise and that waiter's
// `await` continuation actually running.
export class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  private readonly max: number;

  constructor(max: number) {
    if (!Number.isInteger(max) || max < 1) {
      throw new RangeError(`Semaphore max must be a positive integer, got ${max}`);
    }
    this.max = max;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      // Queue and wait — when our resolver fires, the slot has already
      // been handed to us; do NOT increment active.
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) {
        // Hand off our slot directly — no decrement, no transient gap
        // where active < max while a waker is mid-flight.
        next();
      } else {
        this.active--;
      }
    }
  }
}
