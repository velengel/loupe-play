export function createSingleFlight<T>(operation: () => Promise<T>) {
  let current: Promise<T> | null = null

  return (): Promise<T> => {
    if (current) {
      return current
    }

    const run = Promise.resolve().then(operation)
    current = run

    const clear = () => {
      if (current === run) {
        current = null
      }
    }

    void run.then(clear, clear)
    return run
  }
}
