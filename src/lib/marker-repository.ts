export interface Marker {
  id: string
  trackId: string
  positionMs: number
  label: string | null
  body: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateMarkerInput {
  trackId: string
  positionMs: number
  label: string | null
  body: string | null
}

export interface UpdateMarkerInput extends CreateMarkerInput {
  id: string
}

export interface MarkerIdentityInput {
  id: string
  trackId: string
}

export interface MarkerRepository {
  loadMarkers: (trackId: string) => Promise<Marker[]>
  createMarker: (input: CreateMarkerInput) => Promise<Marker>
  updateMarker: (input: UpdateMarkerInput) => Promise<Marker>
  deleteMarker: (input: MarkerIdentityInput) => Promise<void>
  restoreMarker: (input: MarkerIdentityInput) => Promise<Marker>
}

export type MarkerGateway = MarkerRepository

export interface MarkerDatabase {
  execute: (query: string, bindValues?: unknown[]) => Promise<unknown>
  select: (query: string, bindValues?: unknown[]) => Promise<unknown>
}

export interface MarkerRepositoryDependencies {
  createMarkerId: () => string
  now: () => string
}

interface DatabaseRow {
  [key: string]: unknown
}

type MarkerOperation = 'load' | 'save' | 'delete' | 'restore'
type DeletionState = 'active' | 'deleted'

class MarkerContractError extends Error {}

const defaultDependencies: MarkerRepositoryDependencies = {
  createMarkerId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
}

const selectMarkerColumns = `
  SELECT
    id,
    track_id,
    position_ms,
    label,
    body,
    created_at,
    updated_at,
    deleted_at
  FROM markers
`

const returningMarkerColumns = `
  RETURNING
    id,
    track_id,
    position_ms,
    label,
    body,
    created_at,
    updated_at,
    deleted_at
`

const selectActiveMarkers = `${selectMarkerColumns}
  WHERE track_id = $1
    AND deleted_at IS NULL
  ORDER BY position_ms ASC, created_at ASC, id ASC
`

const insertMarker = `
  INSERT INTO markers (
    id,
    track_id,
    position_ms,
    label,
    body,
    created_at,
    updated_at,
    deleted_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
  ${returningMarkerColumns}
`

const updateMarker = `
  UPDATE markers
  SET
    position_ms = $1,
    label = $2,
    body = $3,
    updated_at = $4
  WHERE id = $5
    AND track_id = $6
    AND deleted_at IS NULL
  ${returningMarkerColumns}
`

const softDeleteMarker = `
  UPDATE markers
  SET
    deleted_at = $1,
    updated_at = $1
  WHERE id = $2
    AND track_id = $3
    AND deleted_at IS NULL
  ${returningMarkerColumns}
`

const restoreMarker = `
  UPDATE markers
  SET
    deleted_at = NULL,
    updated_at = $1
  WHERE id = $2
    AND track_id = $3
    AND deleted_at IS NOT NULL
  ${returningMarkerColumns}
`

function repositoryFailure(operation: MarkerOperation): MarkerContractError {
  const action =
    operation === 'load'
      ? 'load'
      : operation === 'save'
        ? 'save'
        : operation
  return new MarkerContractError(`Marker ${action} failed`)
}

async function withinMarkerBoundary<T>(
  operation: MarkerOperation,
  task: () => Promise<T>,
): Promise<T> {
  try {
    return await task()
  } catch (error) {
    if (error instanceof MarkerContractError) {
      throw error
    }
    throw repositoryFailure(operation)
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new MarkerContractError(`Stored Marker has an invalid ${field}`)
  }
  return value
}

function requirePosition(positionMs: unknown): number {
  if (
    typeof positionMs !== 'number' ||
    !Number.isSafeInteger(positionMs) ||
    positionMs < 0
  ) {
    throw new MarkerContractError(
      'Marker position must be a non-negative safe integer',
    )
  }
  return positionMs
}

function requireStoredPosition(positionMs: unknown): number {
  try {
    return requirePosition(positionMs)
  } catch {
    throw new MarkerContractError(
      'Stored Marker has an invalid position',
    )
  }
}

function requireNullableString(
  value: unknown,
  field: string,
): string | null {
  if (value === null || typeof value === 'string') {
    return value
  }
  throw new MarkerContractError(`Stored Marker has an invalid ${field}`)
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new MarkerContractError('Marker text must be a string or null')
  }
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function requireIdentity(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new MarkerContractError(`Marker ${name} is required`)
  }
  return value
}

function rowsFrom(result: unknown): DatabaseRow[] {
  if (
    !Array.isArray(result) ||
    result.some(
      (row) => typeof row !== 'object' || row === null || Array.isArray(row),
    )
  ) {
    throw new MarkerContractError('Stored Marker query result is invalid')
  }
  return result as DatabaseRow[]
}

function markerFromRow(
  row: DatabaseRow,
  expectedTrackId: string,
  expectedDeletionState: DeletionState,
): Marker {
  const id = requireNonEmptyString(row.id, 'id')
  const trackId = requireNonEmptyString(row.track_id, 'Track identity')
  const deletedAt = row.deleted_at

  if (trackId !== expectedTrackId) {
    throw new MarkerContractError(
      'Stored Marker belongs to an unexpected Track identity',
    )
  }
  if (
    (expectedDeletionState === 'active' && deletedAt !== null) ||
    (expectedDeletionState === 'deleted' &&
      (typeof deletedAt !== 'string' || deletedAt.length === 0))
  ) {
    throw new MarkerContractError(
      'Stored Marker has an invalid deletion state',
    )
  }

  return {
    id,
    trackId,
    positionMs: requireStoredPosition(row.position_ms),
    label: requireNullableString(row.label, 'label'),
    body: requireNullableString(row.body, 'body'),
    createdAt: requireNonEmptyString(row.created_at, 'creation time'),
    updatedAt: requireNonEmptyString(row.updated_at, 'update time'),
  }
}

export function createMarkerRepository(
  database: MarkerDatabase,
  dependencies: MarkerRepositoryDependencies = defaultDependencies,
): MarkerRepository {
  function markerFromMutation(
    result: unknown,
    trackId: string,
    deletionState: DeletionState,
  ): Marker {
    const rows = rowsFrom(result)
    if (rows.length !== 1) {
      throw new MarkerContractError('Marker mutation did not return one row')
    }
    return markerFromRow(rows[0], trackId, deletionState)
  }

  return {
    async loadMarkers(trackIdValue: string): Promise<Marker[]> {
      const trackId = requireIdentity(trackIdValue, 'Track identity')
      return withinMarkerBoundary('load', async () => {
        const result = await database.select(selectActiveMarkers, [trackId])
        return rowsFrom(result).map((row) =>
          markerFromRow(row, trackId, 'active'),
        )
      })
    },

    async createMarker(input: CreateMarkerInput): Promise<Marker> {
      const trackId = requireIdentity(input.trackId, 'Track identity')
      const positionMs = requirePosition(input.positionMs)
      const label = normalizeOptionalText(input.label)
      const body = normalizeOptionalText(input.body)

      return withinMarkerBoundary('save', async () => {
        const id = requireIdentity(
          dependencies.createMarkerId(),
          'generated id',
        )
        const timestamp = requireIdentity(dependencies.now(), 'timestamp')
        const result = await database.select(insertMarker, [
          id,
          trackId,
          positionMs,
          label,
          body,
          timestamp,
          timestamp,
        ])
        return markerFromMutation(result, trackId, 'active')
      })
    },

    async updateMarker(input: UpdateMarkerInput): Promise<Marker> {
      const id = requireIdentity(input.id, 'id')
      const trackId = requireIdentity(input.trackId, 'Track identity')
      const positionMs = requirePosition(input.positionMs)
      const label = normalizeOptionalText(input.label)
      const body = normalizeOptionalText(input.body)

      return withinMarkerBoundary('save', async () => {
        const timestamp = requireIdentity(dependencies.now(), 'timestamp')
        const result = await database.select(updateMarker, [
          positionMs,
          label,
          body,
          timestamp,
          id,
          trackId,
        ])
        return markerFromMutation(result, trackId, 'active')
      })
    },

    async deleteMarker(input: MarkerIdentityInput): Promise<void> {
      const id = requireIdentity(input.id, 'id')
      const trackId = requireIdentity(input.trackId, 'Track identity')

      await withinMarkerBoundary('delete', async () => {
        const timestamp = requireIdentity(dependencies.now(), 'timestamp')
        const result = await database.select(softDeleteMarker, [
          timestamp,
          id,
          trackId,
        ])
        markerFromMutation(result, trackId, 'deleted')
      })
    },

    async restoreMarker(input: MarkerIdentityInput): Promise<Marker> {
      const id = requireIdentity(input.id, 'id')
      const trackId = requireIdentity(input.trackId, 'Track identity')

      return withinMarkerBoundary('restore', async () => {
        const timestamp = requireIdentity(dependencies.now(), 'timestamp')
        const result = await database.select(restoreMarker, [
          timestamp,
          id,
          trackId,
        ])
        return markerFromMutation(result, trackId, 'active')
      })
    },
  }
}
