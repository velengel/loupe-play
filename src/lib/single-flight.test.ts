import { describe, expect, it, vi } from 'vitest'

import { createSingleFlight } from './single-flight'

function deferred() {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

describe('createSingleFlight', () => {
  it('shares one in-flight operation and permits a later run', async () => {
    const first = deferred()
    const operation = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(undefined)
    const run = createSingleFlight(operation)

    const left = run()
    const right = run()
    await Promise.resolve()

    expect(operation).toHaveBeenCalledOnce()

    first.resolve()
    await expect(Promise.all([left, right])).resolves.toEqual([
      undefined,
      undefined,
    ])

    await expect(run()).resolves.toBeUndefined()
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('permits a retry after the shared operation rejects', async () => {
    const first = deferred()
    const operation = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(undefined)
    const run = createSingleFlight(operation)

    const failed = run()
    first.reject(new Error('database unavailable'))

    await expect(failed).rejects.toThrow('database unavailable')
    await expect(run()).resolves.toBeUndefined()
    expect(operation).toHaveBeenCalledTimes(2)
  })
})
