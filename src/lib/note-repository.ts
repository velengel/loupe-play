export interface TrackNote {
  id: string
  trackId: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface ListeningNote extends TrackNote {
  playEventId: string
  playEventStartedAt: string
  playEventStartPositionMs: number
  playEventEndPositionMs: number | null
  playEventLoopStartMs: number | null
  playEventLoopEndMs: number | null
}

export interface CreateTrackNoteInput {
  trackId: string
  body: string
}

export interface CreateListeningNoteInput extends CreateTrackNoteInput {
  playEventId: string
}

export interface UpdateNoteInput extends CreateTrackNoteInput {
  id: string
}

export interface NoteIdentityInput {
  id: string
  trackId: string
}

export interface NoteRepository {
  loadTrackNotes: (trackId: string) => Promise<TrackNote[]>
  loadListeningNotes: (trackId: string) => Promise<ListeningNote[]>
  createTrackNote: (input: CreateTrackNoteInput) => Promise<TrackNote>
  createListeningNote: (
    input: CreateListeningNoteInput,
  ) => Promise<ListeningNote>
  updateTrackNote: (input: UpdateNoteInput) => Promise<TrackNote>
  updateListeningNote: (input: UpdateNoteInput) => Promise<ListeningNote>
  deleteTrackNote: (input: NoteIdentityInput) => Promise<void>
  deleteListeningNote: (input: NoteIdentityInput) => Promise<void>
  restoreTrackNote: (input: NoteIdentityInput) => Promise<TrackNote>
  restoreListeningNote: (input: NoteIdentityInput) => Promise<ListeningNote>
}

export type NoteGateway = NoteRepository

export interface NoteDatabase {
  execute: (query: string, bindValues?: unknown[]) => Promise<unknown>
  select: (query: string, bindValues?: unknown[]) => Promise<unknown>
}

export interface NoteRepositoryDependencies {
  createNoteId: () => string
  now: () => string
}

interface DatabaseRow {
  [key: string]: unknown
}

type NoteKind = 'listening' | 'track'
type NoteOperation = 'delete' | 'load' | 'restore' | 'save'

class NoteContractError extends Error {}

const defaultDependencies: NoteRepositoryDependencies = {
  createNoteId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
}

const trackColumns = `
  id,
  track_id,
  body,
  created_at,
  updated_at,
  deleted_at
`

const listeningColumns = `
  id,
  play_event_id,
  track_id,
  body,
  created_at,
  updated_at,
  deleted_at,
  (SELECT started_at FROM play_events WHERE id = play_event_id)
    AS play_event_started_at,
  (SELECT start_position_ms FROM play_events WHERE id = play_event_id)
    AS play_event_start_position_ms,
  (SELECT end_position_ms FROM play_events WHERE id = play_event_id)
    AS play_event_end_position_ms,
  (SELECT loop_start_ms FROM play_events WHERE id = play_event_id)
    AS play_event_loop_start_ms,
  (SELECT loop_end_ms FROM play_events WHERE id = play_event_id)
    AS play_event_loop_end_ms
`

const queries = {
  track: {
    load: `SELECT ${trackColumns} FROM track_notes WHERE track_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC, id DESC`,
    create: `INSERT INTO track_notes (id, track_id, body, created_at, updated_at, deleted_at) VALUES ($1, $2, $3, $4, $4, NULL) RETURNING ${trackColumns}`,
  },
  listening: {
    load: `
      SELECT
        notes.id,
        notes.play_event_id,
        notes.track_id,
        notes.body,
        notes.created_at,
        notes.updated_at,
        notes.deleted_at,
        events.started_at AS play_event_started_at,
        events.start_position_ms AS play_event_start_position_ms,
        events.end_position_ms AS play_event_end_position_ms,
        events.loop_start_ms AS play_event_loop_start_ms,
        events.loop_end_ms AS play_event_loop_end_ms
      FROM listening_notes AS notes
      INNER JOIN play_events AS events
        ON events.id = notes.play_event_id
        AND events.track_id = notes.track_id
      WHERE notes.track_id = $1
        AND notes.deleted_at IS NULL
      ORDER BY notes.created_at DESC, notes.id DESC
    `,
    create: `
      INSERT INTO listening_notes (
        id, play_event_id, track_id, body, created_at, updated_at, deleted_at
      )
      SELECT $1, events.id, events.track_id, $4, $5, $5, NULL
      FROM play_events AS events
      WHERE events.id = $2
        AND events.track_id = $3
      RETURNING ${listeningColumns}
    `,
  },
} as const

function returningUpdate(kind: NoteKind): string {
  const table = kind === 'track' ? 'track_notes' : 'listening_notes'
  const columns = kind === 'track' ? trackColumns : listeningColumns
  return `UPDATE ${table} SET body = $1, updated_at = $2 WHERE id = $3 AND track_id = $4 AND deleted_at IS NULL RETURNING ${columns}`
}

function returningDelete(kind: NoteKind): string {
  const table = kind === 'track' ? 'track_notes' : 'listening_notes'
  const columns = kind === 'track' ? trackColumns : listeningColumns
  return `UPDATE ${table} SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND track_id = $3 AND deleted_at IS NULL RETURNING ${columns}`
}

function returningRestore(kind: NoteKind): string {
  const table = kind === 'track' ? 'track_notes' : 'listening_notes'
  const columns = kind === 'track' ? trackColumns : listeningColumns
  return `UPDATE ${table} SET deleted_at = NULL, updated_at = $1 WHERE id = $2 AND track_id = $3 AND deleted_at IS NOT NULL RETURNING ${columns}`
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new NoteContractError(`Stored Note has an invalid ${name}`)
  }
  return value
}

function requireIdentity(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new NoteContractError(`Note ${name} is required`)
  }
  return value
}

function normalizeBody(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new NoteContractError('Note body is required')
  }
  return value.trim()
}

function requirePosition(value: unknown, name: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new NoteContractError(`Stored Note has an invalid ${name}`)
  }
  return value
}

function nullablePosition(value: unknown, name: string): number | null {
  return value === null ? null : requirePosition(value, name)
}

function trackNoteFromRow(row: DatabaseRow): TrackNote {
  const body = requireText(row.body, 'body')
  if (body !== body.trim()) {
    throw new NoteContractError('Stored Note has an unnormalized body')
  }
  return {
    id: requireText(row.id, 'id'),
    trackId: requireText(row.track_id, 'Track identity'),
    body,
    createdAt: requireText(row.created_at, 'creation time'),
    updatedAt: requireText(row.updated_at, 'update time'),
  }
}

function listeningNoteFromRow(row: DatabaseRow): ListeningNote {
  const playEventStartPositionMs = requirePosition(
    row.play_event_start_position_ms,
    'PlayEvent start position',
  )
  const playEventEndPositionMs = nullablePosition(
    row.play_event_end_position_ms,
    'PlayEvent end position',
  )
  const playEventLoopStartMs = nullablePosition(
    row.play_event_loop_start_ms,
    'PlayEvent loop start',
  )
  const playEventLoopEndMs = nullablePosition(
    row.play_event_loop_end_ms,
    'PlayEvent loop end',
  )

  if (
    (playEventLoopStartMs === null) !== (playEventLoopEndMs === null) ||
    (playEventLoopStartMs !== null &&
      playEventLoopEndMs !== null &&
      playEventLoopStartMs >= playEventLoopEndMs)
  ) {
    throw new NoteContractError('Stored Note has an invalid PlayEvent loop')
  }

  return {
    ...trackNoteFromRow(row),
    playEventId: requireText(row.play_event_id, 'PlayEvent identity'),
    playEventStartedAt: requireText(
      row.play_event_started_at,
      'PlayEvent start time',
    ),
    playEventStartPositionMs,
    playEventEndPositionMs,
    playEventLoopStartMs,
    playEventLoopEndMs,
  }
}

function rowsFrom(value: unknown): DatabaseRow[] {
  return Array.isArray(value) ? (value as DatabaseRow[]) : []
}

function oneReturnedNote<T extends TrackNote>(
  value: unknown,
  trackId: string,
  fromRow: (row: DatabaseRow) => T,
): T {
  const rows = rowsFrom(value)
  if (rows.length !== 1) {
    throw new NoteContractError('Note mutation did not return one row')
  }
  const note = fromRow(rows[0])
  if (note.trackId !== trackId) {
    throw new NoteContractError('Note mutation returned another Track')
  }
  return note
}

async function boundary<T>(
  operation: NoteOperation,
  task: () => Promise<T>,
): Promise<T> {
  try {
    return await task()
  } catch (error) {
    if (error instanceof NoteContractError) {
      throw error
    }
    throw new NoteContractError(`Note ${operation} failed`)
  }
}

export function createNoteRepository(
  database: NoteDatabase,
  dependencies: NoteRepositoryDependencies = defaultDependencies,
): NoteRepository {
  async function load<T extends TrackNote>(
    kind: NoteKind,
    trackId: string,
    fromRow: (row: DatabaseRow) => T,
  ): Promise<T[]> {
    const expectedTrackId = requireIdentity(trackId, 'Track identity')
    return boundary('load', async () => {
      const rows = rowsFrom(
        await database.select(queries[kind].load, [expectedTrackId]),
      )
      return rows.map((row) => {
        const note = fromRow(row)
        if (note.trackId !== expectedTrackId) {
          throw new NoteContractError('Stored Note belongs to another Track')
        }
        return note
      })
    })
  }

  async function update<T extends TrackNote>(
    kind: NoteKind,
    input: UpdateNoteInput,
    fromRow: (row: DatabaseRow) => T,
  ): Promise<T> {
    const id = requireIdentity(input.id, 'id')
    const trackId = requireIdentity(input.trackId, 'Track identity')
    const body = normalizeBody(input.body)
    const updatedAt = requireIdentity(dependencies.now(), 'update time')
    return boundary('save', async () =>
      oneReturnedNote(
        await database.select(returningUpdate(kind), [
          body,
          updatedAt,
          id,
          trackId,
        ]),
        trackId,
        fromRow,
      ),
    )
  }

  async function mutateDeletion<T extends TrackNote>(
    kind: NoteKind,
    operation: 'delete' | 'restore',
    input: NoteIdentityInput,
    fromRow: (row: DatabaseRow) => T,
  ): Promise<T> {
    const id = requireIdentity(input.id, 'id')
    const trackId = requireIdentity(input.trackId, 'Track identity')
    const updatedAt = requireIdentity(dependencies.now(), 'update time')
    const query =
      operation === 'delete'
        ? returningDelete(kind)
        : returningRestore(kind)
    return boundary(operation, async () =>
      oneReturnedNote(
        await database.select(query, [updatedAt, id, trackId]),
        trackId,
        fromRow,
      ),
    )
  }

  return {
    loadTrackNotes: (trackId) => load('track', trackId, trackNoteFromRow),
    loadListeningNotes: (trackId) =>
      load('listening', trackId, listeningNoteFromRow),

    async createTrackNote(input) {
      const trackId = requireIdentity(input.trackId, 'Track identity')
      const body = normalizeBody(input.body)
      const id = requireIdentity(dependencies.createNoteId(), 'id')
      const createdAt = requireIdentity(dependencies.now(), 'creation time')
      return boundary('save', async () =>
        oneReturnedNote(
          await database.select(queries.track.create, [
            id,
            trackId,
            body,
            createdAt,
          ]),
          trackId,
          trackNoteFromRow,
        ),
      )
    },

    async createListeningNote(input) {
      const playEventId = requireIdentity(input.playEventId, 'PlayEvent identity')
      const trackId = requireIdentity(input.trackId, 'Track identity')
      const body = normalizeBody(input.body)
      const id = requireIdentity(dependencies.createNoteId(), 'id')
      const createdAt = requireIdentity(dependencies.now(), 'creation time')
      return boundary('save', async () =>
        oneReturnedNote(
          await database.select(queries.listening.create, [
            id,
            playEventId,
            trackId,
            body,
            createdAt,
          ]),
          trackId,
          listeningNoteFromRow,
        ),
      )
    },

    updateTrackNote: (input) =>
      update('track', input, trackNoteFromRow),
    updateListeningNote: (input) =>
      update('listening', input, listeningNoteFromRow),

    async deleteTrackNote(input) {
      await mutateDeletion('track', 'delete', input, trackNoteFromRow)
    },
    async deleteListeningNote(input) {
      await mutateDeletion(
        'listening',
        'delete',
        input,
        listeningNoteFromRow,
      )
    },

    restoreTrackNote: (input) =>
      mutateDeletion('track', 'restore', input, trackNoteFromRow),
    restoreListeningNote: (input) =>
      mutateDeletion(
        'listening',
        'restore',
        input,
        listeningNoteFromRow,
      ),
  }
}
