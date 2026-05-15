type TaskFactory<T> = () => Promise<T>;

interface QueueTask<T> {
  run: TaskFactory<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export class ImageTaskQueue {
  private maxConcurrent = 3;
  private running = 0;
  private queue: QueueTask<unknown>[] = [];

  setMaxConcurrent (count: number): void {
    const next = Number(count);
    this.maxConcurrent = Number.isFinite(next) && next > 0 ? Math.floor(next) : 3;
    this.drain();
  }

  getSnapshot (): { running: number; pending: number; maxConcurrent: number; } {
    return {
      running: this.running,
      pending: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }

  async submit<T> (run: TaskFactory<T>): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      this.queue.push({ run, resolve, reject });
      this.drain();
    });
  }

  private drain (): void {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running++;

      Promise.resolve()
        .then(() => task.run())
        .then(task.resolve, task.reject)
        .finally(() => {
          this.running = Math.max(0, this.running - 1);
          this.drain();
        });
    }
  }
}

export const imageTaskQueue = new ImageTaskQueue();
