import { describe, expect, it, vi } from 'vitest'

import { createPlayEventRepository } from './play-event-repository'

const eventRow = {
  id: 'event-1',
  track_id: 'track-1',
  started_at: '2026-09-02T10:00:00.000Z',
  ended_at: null,
  start_position_ms: 12_345,
  end_position_ms: null,
  mode: 'practice',
  playback_rate: 0.8,
  loop_start_ms: 10_000,
  loop_end_ms: 15_000,
  closed_reason: null,
  recovered_at: null,
  active_slot: 1,
}

const dependencies = {
  createPlayEventId: () => 'event-1',
  now: () => '2026-09-02T10:00:00.000Z',
}

describe('PlayEvent repository', () => {
  it('recovers an unknown open event without inventing its end, then starts one bound event', async () => {
    const database = {
      execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
      select: vi.fn().mockResolvedValue([eventRow]),
    }
    const repository = createPlayEventRepository(database, dependencies)

    await expect(
      repository.startPlayEvent({
        trackId: 'track-1',
        startPositionMs: 12_345,
        mode: 'practice',
        playbackRate: 0.8,
        loopStartMs: 10_000,
        loopEndMs: 15_000,
      }),
    ).resolves.toMatchObject({
      id: 'event-1',
      trackId: 'track-1',
      startPositionMs: 12_345,
      mode: 'practice',
    })

    expect(database.execute).toHaveBeenCalledOnce()
    expect(database.execute.mock.calls[0][0]).toMatch(
      /UPDATE\s+play_events[\s\S]*recovered_at[\s\S]*active_slot\s*=\s*NULL[\s\S]*ended_at\s+IS\s+NULL/i,
    )
    expect(database.select).toHaveBeenCalledOnce()
    expect(database.select.mock.calls[0][0]).toMatch(
      /INSERT\s+INTO\s+play_events[\s\S]*RETURNING/i,
    )
    expect(database.select.mock.calls[0][0]).not.toContain('track-1')
    expect(database.select.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        'event-1',
        'track-1',
        12_345,
        'practice',
        0.8,
        10_000,
        15_000,
      ]),
    )
  })

  it('closes one active event once with an integer position and reason', async () => {
    const closed = {
      ...eventRow,
      ended_at: '2026-09-02T10:01:00.000Z',
      end_position_ms: 14_500,
      closed_reason: 'pause',
      active_slot: null,
    }
    const database = {
      execute: vi.fn(),
      select: vi.fn().mockResolvedValue([closed]),
    }
    const repository = createPlayEventRepository(database, {
      ...dependencies,
      now: () => '2026-09-02T10:01:00.000Z',
    })

    await expect(
      repository.closePlayEvent({
        id: 'event-1',
        trackId: 'track-1',
        endPositionMs: 14_500,
        reason: 'pause',
      }),
    ).resolves.toMatchObject({
      id: 'event-1',
      endedAt: '2026-09-02T10:01:00.000Z',
      endPositionMs: 14_500,
      closedReason: 'pause',
    })
    expect(database.execute).not.toHaveBeenCalled()
    expect(database.select.mock.calls[0][0]).toMatch(
      /UPDATE\s+play_events[\s\S]*ended_at\s*=\s*\$\d+[\s\S]*active_slot\s*=\s*NULL[\s\S]*WHERE[\s\S]*id\s*=\s*\$\d+[\s\S]*track_id\s*=\s*\$\d+[\s\S]*ended_at\s+IS\s+NULL[\s\S]*RETURNING/i,
    )
  })

  it.each([
    ['fractional position', { startPositionMs: 1.5 }],
    ['negative position', { startPositionMs: -1 }],
    ['zero rate', { playbackRate: 0 }],
    ['half loop', { loopStartMs: 10, loopEndMs: null }],
    ['reversed loop', { loopStartMs: 20, loopEndMs: 10 }],
    ['unknown mode', { mode: 'study' }],
  ])('rejects %s before database access', async (_name, override) => {
    const database = { execute: vi.fn(), select: vi.fn() }
    const repository = createPlayEventRepository(database, dependencies)

    await expect(
      repository.startPlayEvent({
        trackId: 'track-1',
        startPositionMs: 0,
        mode: 'listen',
        playbackRate: 1,
        loopStartMs: null,
        loopEndMs: null,
        ...override,
      } as never),
    ).rejects.toThrow(/PlayEvent/i)
    expect(database.execute).not.toHaveBeenCalled()
    expect(database.select).not.toHaveBeenCalled()
  })

  it('redacts raw database failures', async () => {
    const database = {
      execute: vi.fn().mockRejectedValue(
        new Error('SQLITE /private/secret.wav UPDATE play_events'),
      ),
      select: vi.fn(),
    }
    const repository = createPlayEventRepository(database, dependencies)

    await expect(
      repository.startPlayEvent({
        trackId: 'track-1',
        startPositionMs: 0,
        mode: 'listen',
        playbackRate: 1,
        loopStartMs: null,
        loopEndMs: null,
      }),
    ).rejects.not.toThrow(/private|SQLITE|UPDATE/)
  })
})
