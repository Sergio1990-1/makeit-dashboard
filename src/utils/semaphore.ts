// Concurrency limiter with FIFO queue: at most `max` tasks run at once.
export class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
