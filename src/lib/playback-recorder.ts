import type {
  PlayEvent,
  PlayEventCloseReason,
  PlayEventRepository,
  PlaybackMode,
  StartPlayEventInput,
} from './play-event-repository'

export interface PlaybackSnapshot {
  trackId: string
  positionMs: number
  mode: PlaybackMode
  playbackRate: number
  loopStartMs: number | null
  loopEndMs: number | null
}

export interface PlaybackRecorderOptions {
  onStarted?: (event: PlayEvent) => void
  onError?: (operation: 'close' | 'start') => void
}

export interface PlaybackRecorder {
  start: (snapshot: PlaybackSnapshot) => Promise<PlayEvent | null>
  close: (
    endPositionMs: number,
    reason: PlayEventCloseReason,
  ) => Promise<void>
  split: (
    endPositionMs: number,
    reason: PlayEventCloseReason,
    next: PlaybackSnapshot,
  ) => Promise<PlayEvent | null>
  flush: () => Promise<void>
}

type RecorderRepository = Pick<
  PlayEventRepository,
  'closePlayEvent' | 'startPlayEvent'
>

function startInput(snapshot: PlaybackSnapshot): StartPlayEventInput {
  return {
    trackId: snapshot.trackId,
    startPositionMs: snapshot.positionMs,
    mode: snapshot.mode,
    playbackRate: snapshot.playbackRate,
    loopStartMs: snapshot.loopStartMs,
    loopEndMs: snapshot.loopEndMs,
  }
}

export function createPlaybackRecorder(
  repository: RecorderRepository,
  options: PlaybackRecorderOptions = {},
): PlaybackRecorder {
  let active: PlayEvent | null = null
  let queue: Promise<void> = Promise.resolve()

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const operation = queue.then(task)
    queue = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }

  async function startInsideQueue(
    snapshot: PlaybackSnapshot,
  ): Promise<PlayEvent> {
    const event = await repository.startPlayEvent(startInput(snapshot))
    active = event
    options.onStarted?.(event)
    return event
  }

  async function closeInsideQueue(
    endPositionMs: number,
    reason: PlayEventCloseReason,
  ): Promise<void> {
    const closing = active
    if (!closing) {
      return
    }
    active = null
    await repository.closePlayEvent({
      id: closing.id,
      trackId: closing.trackId,
      endPositionMs,
      reason,
    })
  }

  return {
    start(snapshot) {
      return enqueue(async () => {
        if (active) {
          return active
        }
        try {
          return await startInsideQueue(snapshot)
        } catch {
          options.onError?.('start')
          return null
        }
      })
    },

    close(endPositionMs, reason) {
      return enqueue(async () => {
        try {
          await closeInsideQueue(endPositionMs, reason)
        } catch {
          options.onError?.('close')
        }
      })
    },

    split(endPositionMs, reason, next) {
      return enqueue(async () => {
        try {
          await closeInsideQueue(endPositionMs, reason)
        } catch {
          options.onError?.('close')
        }
        try {
          return await startInsideQueue(next)
        } catch {
          options.onError?.('start')
          return null
        }
      })
    },

    flush() {
      return queue
    },
  }
}
