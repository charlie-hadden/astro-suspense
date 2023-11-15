export type PromisePair = {
  content: Promise<string>;
  error: () => Promise<string>;
};

export class SuspensePromises {
  private lastId = 0;
  private promises = new Map<number, PromisePair>();

  registerPromises(promisePair: PromisePair): number {
    const id = this.lastId++;

    this.promises.set(id, promisePair);

    return id;
  }

  async *resolvePromises(): AsyncGenerator<{ id: number; content: string }> {
    let promises = [...this.promises.entries()].map(([id, map]) =>
      Object.assign(
        new Promise<{ id: number; content: string }>((resolve) => {
          map.content
            .then((content) => resolve({ id, content }))
            .catch((err) => {
              console.error(err);
              map.error().then((content) => resolve({ id, content }));
            });
        }),
        { id },
      ),
    );

    while (promises.length > 0) {
      const result = await Promise.race(promises);

      yield result;

      promises = promises.filter((p) => p.id !== result.id);
    }
  }
}
