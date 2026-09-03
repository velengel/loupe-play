import { describe, expect, it, vi } from 'vitest'

import { createPlaybackRecorder } from './playback-recorder'
import type { PlayEvent } from './play-event-repository'

function createEvent(id: string, trackId = 'track-1'): PlayEvent {
  return {
    id,
    trackId,
    startedAt: '2026-09-02T10:00:00.000Z',
    endedAt: null,
    startPositionMs: 1_000,
    endPositionMs: null,
    mode: 'listen',
    playbackRate: 1,
    loopStartMs: null,
    loopEndMs: null,
    closedReason: null,
    recoveredAt: null,
  }
}

const listenSnapshot = {
  trackId: 'track-1',
  positionMs: 1_000,
  mode: 'listen' as const,
  playbackRate: 1,
  loopStartMs: null,
  loopEndMs: null,
}

describe('Playback recorder', () => {
  it('serializes start, split, and close without dropping the old Track close', async () => {
    const order: string[] = []
    let eventSequence = 0
    const repository = {
      startPlayEvent: vi.fn().mockImplementation(async (input) => {
        const event = createEvent(`event-${++eventSequence}`, input.trackId)
        order.push(`start:${event.id}:${input.trackId}:${input.mode}`)
        return event
      }),
      closePlayEvent: vi.fn().mockImplementation(async (input) => {
        order.push(`close:${input.id}:${input.trackId}:${input.reason}`)
        return {
          ...createEvent(input.id, input.trackId),
          endedAt: '2026-09-02T10:01:00.000Z',
          endPositionMs: input.endPositionMs,
          closedReason: input.reason,
        }
      }),
      loadPlayEvents: vi.fn(),
    }
    const onStarted = vi.fn()
    const recorder = createPlaybackRecorder(repository, { onStarted })

    void recorder.start(listenSnapshot)
    void recorder.split(
      2_000,
      'mode-change',
      { ...listenSnapshot, positionMs: 2_000, mode: 'practice' },
    )
    void recorder.split(
      2_500,
      'track-change',
      { ...listenSnapshot, trackId: 'track-2', positionMs: 0 },
    )
    void recorder.close(500, 'pause')
    await recorder.flush()

    expect(order).toEqual([
      'start:event-1:track-1:listen',
      'close:event-1:track-1:mode-change',
      'start:event-2:track-1:practice',
      'close:event-2:track-1:track-change',
      'start:event-3:track-2:listen',
      'close:event-3:track-2:pause',
    ])
    expect(onStarted).toHaveBeenCalledTimes(3)
  })

  it('coalesces duplicate playing and duplicate close signals', async () => {
    const repository = {
      startPlayEvent: vi.fn().mockResolvedValue(createEvent('event-1')),
      closePlayEvent: vi.fn().mockImplementation(async (input) => ({
        ...createEvent(input.id),
        endedAt: '2026-09-02T10:01:00.000Z',
        endPositionMs: input.endPositionMs,
        closedReason: input.reason,
      })),
      loadPlayEvents: vi.fn(),
    }
    const recorder = createPlaybackRecorder(repository)

    void recorder.start(listenSnapshot)
    void recorder.start(listenSnapshot)
    void recorder.close(2_000, 'pause')
    void recorder.close(2_000, 'pause')
    await recorder.flush()

    expect(repository.startPlayEvent).toHaveBeenCalledOnce()
    expect(repository.closePlayEvent).toHaveBeenCalledOnce()
  })

  it('keeps the queue usable after a rejected write', async () => {
    const repository = {
      startPlayEvent: vi
        .fn()
        .mockRejectedValueOnce(new Error('/private/raw.mp3 SQLITE'))
        .mockResolvedValueOnce(createEvent('event-2')),
      closePlayEvent: vi.fn(),
      loadPlayEvents: vi.fn(),
    }
    const onError = vi.fn()
    const recorder = createPlaybackRecorder(repository, { onError })

    void recorder.start(listenSnapshot)
    await recorder.flush()
    void recorder.start({ ...listenSnapshot, positionMs: 2_000 })
    await recorder.flush()

    expect(repository.startPlayEvent).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith('start')
  })
})
