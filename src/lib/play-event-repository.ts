export type PlaybackMode = 'listen' | 'practice'

export type PlayEventCloseReason =
  | 'pause'
  | 'ended'
  | 'track-change'
  | 'mode-change'
  | 'rate-change'
  | 'loop-change'
  | 'manual-seek'
  | 'load-failure'
  | 'retry'
  | 'unmount'

export interface PlayEvent {
  id: string
  trackId: string
  startedAt: string
  endedAt: string | null
  startPositionMs: number
  endPositionMs: number | null
  mode: PlaybackMode
  playbackRate: number
  loopStartMs: number | null
  loopEndMs: number | null
  closedReason: PlayEventCloseReason | null
  recoveredAt: string | null
}

export interface StartPlayEventInput {
  trackId: string
  startPositionMs: number
  mode: PlaybackMode
  playbackRate: number
  loopStartMs: number | null
  loopEndMs: number | null
}

export interface ClosePlayEventInput {
  id: string
  trackId: string
  endPositionMs: number
  reason: PlayEventCloseReason
}

export interface PlayEventRepository {
  loadPlayEvents: (trackId: string) => Promise<PlayEvent[]>
  startPlayEvent: (input: StartPlayEventInput) => Promise<PlayEvent>
  closePlayEvent: (input: ClosePlayEventInput) => Promise<PlayEvent>
}

export interface PlayEventDatabase {
  execute: (query: string, bindValues?: unknown[]) => Promise<unknown>
  select: (query: string, bindValues?: unknown[]) => Promise<unknown>
}

export interface PlayEventRepositoryDependencies {
  createPlayEventId: () => string
  now: () => string
}

interface DatabaseRow {
  [key: string]: unknown
}

class PlayEventContractError extends Error {}

const closeReasons = new Set<PlayEventCloseReason>([
  'pause',
  'ended',
  'track-change',
  'mode-change',
  'rate-change',
  'loop-change',
  'manual-seek',
  'load-failure',
  'retry',
  'unmount',
])

const defaultDependencies: PlayEventRepositoryDependencies = {
  createPlayEventId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
}

const returningColumns = `
  RETURNING
    id,
    track_id,
    started_at,
    ended_at,
    start_position_ms,
    end_position_ms,
    mode,
    playback_rate,
    loop_start_ms,
    loop_end_ms,
    closed_reason,
    recovered_at,
    active_slot
`

const recoverOpenEvents = `
  UPDATE play_events
  SET
    recovered_at = $1,
    active_slot = NULL
  WHERE ended_at IS NULL
    AND recovered_at IS NULL
    AND active_slot = 1
`

const insertPlayEvent = `
  INSERT INTO play_events (
    id,
    track_id,
    started_at,
    ended_at,
    start_position_ms,
    end_position_ms,
    mode,
    playback_rate,
    loop_start_ms,
    loop_end_ms,
    closed_reason,
    recovered_at,
    active_slot
  ) VALUES ($1, $2, $3, NULL, $4, NULL, $5, $6, $7, $8, NULL, NULL, 1)
  ${returningColumns}
`

const closePlayEvent = `
  UPDATE play_events
  SET
    ended_at = $1,
    end_position_ms = $2,
    closed_reason = $3,
    active_slot = NULL
  WHERE id = $4
    AND track_id = $5
    AND ended_at IS NULL
    AND recovered_at IS NULL
  ${returningColumns}
`

const selectPlayEvents = `
  SELECT
    id,
    track_id,
    started_at,
    ended_at,
    start_position_ms,
    end_position_ms,
    mode,
    playback_rate,
    loop_start_ms,
    loop_end_ms,
    closed_reason,
    recovered_at,
    active_slot
  FROM play_events
  WHERE track_id = $1
  ORDER BY started_at DESC, id DESC
`

function requireText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PlayEventContractError(`PlayEvent ${name} is invalid`)
  }
  return value
}

function nullableText(value: unknown, name: string): string | null {
  if (value === null) {
    return null
  }
  return requireText(value, name)
}

function requirePosition(value: unknown, name: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new PlayEventContractError(`PlayEvent ${name} is invalid`)
  }
  return value
}

function nullablePosition(value: unknown, name: string): number | null {
  return value === null ? null : requirePosition(value, name)
}

function requireMode(value: unknown): PlaybackMode {
  if (value !== 'listen' && value !== 'practice') {
    throw new PlayEventContractError('PlayEvent mode is invalid')
  }
  return value
}

function requireRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new PlayEventContractError('PlayEvent playback rate is invalid')
  }
  return value
}

function requireReason(value: unknown): PlayEventCloseReason {
  if (typeof value !== 'string' || !closeReasons.has(value as PlayEventCloseReason)) {
    throw new PlayEventContractError('PlayEvent close reason is invalid')
  }
  return value as PlayEventCloseReason
}

function nullableReason(value: unknown): PlayEventCloseReason | null {
  return value === null ? null : requireReason(value)
}

function validateLoop(
  start: unknown,
  end: unknown,
): { loopStartMs: number | null; loopEndMs: number | null } {
  if (start === null && end === null) {
    return { loopStartMs: null, loopEndMs: null }
  }
  if (start === null || end === null) {
    throw new PlayEventContractError('PlayEvent loop is incomplete')
  }
  const loopStartMs = requirePosition(start, 'loop start')
  const loopEndMs = requirePosition(end, 'loop end')
  if (loopStartMs >= loopEndMs) {
    throw new PlayEventContractError('PlayEvent loop order is invalid')
  }
  return { loopStartMs, loopEndMs }
}

function playEventFromRow(row: DatabaseRow): PlayEvent {
  const endedAt = nullableText(row.ended_at, 'end time')
  const endPositionMs = nullablePosition(row.end_position_ms, 'end position')
  if ((endedAt === null) !== (endPositionMs === null)) {
    throw new PlayEventContractError('Stored PlayEvent end is inconsistent')
  }
  const loop = validateLoop(row.loop_start_ms, row.loop_end_ms)

  return {
    id: requireText(row.id, 'id'),
    trackId: requireText(row.track_id, 'Track identity'),
    startedAt: requireText(row.started_at, 'start time'),
    endedAt,
    startPositionMs: requirePosition(row.start_position_ms, 'start position'),
    endPositionMs,
    mode: requireMode(row.mode),
    playbackRate: requireRate(row.playback_rate),
    ...loop,
    closedReason: nullableReason(row.closed_reason),
    recoveredAt: nullableText(row.recovered_at, 'recovery time'),
  }
}

function rowsFrom(value: unknown): DatabaseRow[] {
  return Array.isArray(value) ? (value as DatabaseRow[]) : []
}

function oneReturnedEvent(value: unknown, trackId: string): PlayEvent {
  const rows = rowsFrom(value)
  if (rows.length !== 1) {
    throw new PlayEventContractError('PlayEvent mutation did not return one row')
  }
  const event = playEventFromRow(rows[0])
  if (event.trackId !== trackId) {
    throw new PlayEventContractError('PlayEvent mutation returned another Track')
  }
  return event
}

function validateStart(input: StartPlayEventInput): StartPlayEventInput {
  const trackId = requireText(input.trackId, 'Track identity')
  const startPositionMs = requirePosition(
    input.startPositionMs,
    'start position',
  )
  const mode = requireMode(input.mode)
  const playbackRate = requireRate(input.playbackRate)
  const loop = validateLoop(input.loopStartMs, input.loopEndMs)
  return { trackId, startPositionMs, mode, playbackRate, ...loop }
}

async function boundary<T>(
  operation: string,
  task: () => Promise<T>,
): Promise<T> {
  try {
    return await task()
  } catch (error) {
    if (error instanceof PlayEventContractError) {
      throw error
    }
    throw new PlayEventContractError(`PlayEvent ${operation} failed`)
  }
}

export function createPlayEventRepository(
  database: PlayEventDatabase,
  dependencies: PlayEventRepositoryDependencies = defaultDependencies,
): PlayEventRepository {
  return {
    async loadPlayEvents(trackId) {
      const expectedTrackId = requireText(trackId, 'Track identity')
      return boundary('load', async () => {
        const rows = rowsFrom(
          await database.select(selectPlayEvents, [expectedTrackId]),
        )
        return rows.map((row) => {
          const event = playEventFromRow(row)
          if (event.trackId !== expectedTrackId) {
            throw new PlayEventContractError(
              'Stored PlayEvent belongs to another Track',
            )
          }
          return event
        })
      })
    },

    async startPlayEvent(input) {
      const validated = validateStart(input)
      const id = requireText(dependencies.createPlayEventId(), 'id')
      const startedAt = requireText(dependencies.now(), 'start time')

      return boundary('start', async () => {
        await database.execute(recoverOpenEvents, [startedAt])
        const returned = await database.select(insertPlayEvent, [
          id,
          validated.trackId,
          startedAt,
          validated.startPositionMs,
          validated.mode,
          validated.playbackRate,
          validated.loopStartMs,
          validated.loopEndMs,
        ])
        const event = oneReturnedEvent(returned, validated.trackId)
        if (event.id !== id || event.endedAt !== null || event.recoveredAt !== null) {
          throw new PlayEventContractError('Started PlayEvent readback is invalid')
        }
        return event
      })
    },

    async closePlayEvent(input) {
      const id = requireText(input.id, 'id')
      const trackId = requireText(input.trackId, 'Track identity')
      const endPositionMs = requirePosition(input.endPositionMs, 'end position')
      const reason = requireReason(input.reason)
      const endedAt = requireText(dependencies.now(), 'end time')

      return boundary('close', async () => {
        const returned = await database.select(closePlayEvent, [
          endedAt,
          endPositionMs,
          reason,
          id,
          trackId,
        ])
        const event = oneReturnedEvent(returned, trackId)
        if (
          event.id !== id ||
          event.endedAt !== endedAt ||
          event.endPositionMs !== endPositionMs ||
          event.closedReason !== reason
        ) {
          throw new PlayEventContractError('Closed PlayEvent readback is invalid')
        }
        return event
      })
    },
  }
}
