import { describe, expect, it, vi } from 'vitest'

import { checkDatabaseRoundTrip } from './foundation-health'

describe('checkDatabaseRoundTrip', () => {
  it('writes and reads the same probe in one statement', async () => {
    const database = {
      close: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockResolvedValue([{ probe: 'probe-123' }]),
    }
    const getDatabase = vi.fn().mockReturnValue(database)

    await expect(
      checkDatabaseRoundTrip({
        createProbe: () => 'probe-123',
        now: () => '2026-09-01T00:00:00.000Z',
        getDatabase,
      }),
    ).resolves.toBeUndefined()

    expect(database.select).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO foundation_health[\s\S]*RETURNING probe/),
      ['probe-123', '2026-09-01T00:00:00.000Z'],
    )
    expect(getDatabase).toHaveBeenCalledOnce()
    expect(database.close).not.toHaveBeenCalled()
  })

  it('fails when the stored value does not match the probe', async () => {
    const database = {
      close: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockResolvedValue([{ probe: 'different-value' }]),
    }

    await expect(
      checkDatabaseRoundTrip({
        createProbe: () => 'probe-123',
        now: () => '2026-09-01T00:00:00.000Z',
        getDatabase: vi.fn().mockReturnValue(database),
      }),
    ).rejects.toThrow('SQLite round trip did not return the written probe')
    expect(database.close).not.toHaveBeenCalled()
  })

  it('lets a query failure reject without closing the shared pool', async () => {
    const database = {
      close: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockRejectedValue(new Error('write failed')),
    }

    await expect(
      checkDatabaseRoundTrip({
        createProbe: () => 'probe-123',
        now: () => '2026-09-01T00:00:00.000Z',
        getDatabase: vi.fn().mockReturnValue(database),
      }),
    ).rejects.toThrow('write failed')
    expect(database.close).not.toHaveBeenCalled()
  })

  it('keeps concurrent probes independent', async () => {
    let sequence = 0
    const database = {
      select: vi.fn(
        async (_query: string, values: unknown[] = []) => [
          { probe: values[0] },
        ],
      ),
    }
    const dependencies = {
      createProbe: () => `probe-${++sequence}`,
      now: () => '2026-09-01T00:00:00.000Z',
      getDatabase: () => database,
    }

    await expect(
      Promise.all([
        checkDatabaseRoundTrip(dependencies),
        checkDatabaseRoundTrip(dependencies),
      ]),
    ).resolves.toEqual([undefined, undefined])

    expect(database.select).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('RETURNING probe'),
      ['probe-1', '2026-09-01T00:00:00.000Z'],
    )
    expect(database.select).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('RETURNING probe'),
      ['probe-2', '2026-09-01T00:00:00.000Z'],
    )
  })
})
