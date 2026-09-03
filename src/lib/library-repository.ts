import { fallbackTrackTitle } from './library-model'
import type {
  AudioFormat,
  MetadataStatus,
  MusicFolder,
  PersistedLibraryTrack,
  TrackSource,
} from './library-model'

interface LibraryDatabase {
  execute: (query: string, bindValues?: unknown[]) => Promise<unknown>
  select: (query: string, bindValues?: unknown[]) => Promise<unknown>
}

interface DatabaseRow {
  [key: string]: unknown
}

export interface PersistedLibrary {
  folderGeneration: number
  folder: MusicFolder
  tracks: PersistedLibraryTrack[]
}

export interface SelectedLibraryWrite {
  folder: Omit<MusicFolder, 'selectedAt'>
  tracks: PersistedLibraryTrack[]
  expectedFolderGeneration: number
}

export interface SelectedLibraryCommit {
  folderId: string
  selectedAt: string
  trackIdsBySourceIdentifier: Record<string, string>
}

interface LibraryRepositoryDependencies {
  now: () => string
}

const defaultDependencies: LibraryRepositoryDependencies = {
  now: () => new Date().toISOString(),
}

const selectSelectedSnapshot = `
  SELECT
    snapshots.id AS snapshot_id,
    folders.id AS folder_id,
    folders.root_path,
    folders.display_name,
    publications.selected_at,
    publications.sequence,
    publications.folder_generation
  FROM library_publications AS publications
  INNER JOIN library_snapshots AS snapshots
    ON snapshots.id = publications.library_snapshot_id
  INNER JOIN music_folders AS folders
    ON folders.id = snapshots.music_folder_id
  ORDER BY publications.sequence DESC
  LIMIT 1
`

const selectSnapshotByRootPath = `
  SELECT
    snapshots.id AS snapshot_id,
    folders.id AS folder_id,
    folders.root_path,
    folders.display_name,
    publications.selected_at,
    publications.sequence,
    publications.folder_generation
  FROM library_publications AS publications
  INNER JOIN library_snapshots AS snapshots
    ON snapshots.id = publications.library_snapshot_id
  INNER JOIN music_folders AS folders
    ON folders.id = snapshots.music_folder_id
  WHERE folders.root_path = $1
  ORDER BY publications.sequence DESC
  LIMIT 1
`

const selectFolderIdentityByRootPath = `
  SELECT id, root_path, display_name
  FROM music_folders
  WHERE root_path = $1
  LIMIT 1
`

const selectTracksBySnapshot = `
  SELECT
    id,
    music_folder_id,
    source,
    source_identifier,
    path,
    relative_path,
    file_name,
    format,
    title,
    artist,
    album,
    duration_ms,
    metadata_status,
    updated_at
  FROM tracks
  WHERE library_snapshot_id = $1
  ORDER BY relative_path
`

const upsertFolder = `
  INSERT INTO music_folders (id, root_path, display_name)
  VALUES ($1, $2, $3)
  ON CONFLICT(root_path) DO UPDATE SET
    display_name = excluded.display_name
`

const insertSnapshot = `
  INSERT INTO library_snapshots (
    id,
    music_folder_id
  ) VALUES ($1, $2)
`

const insertTrackIdentity = `
  INSERT INTO track_identities (
    id,
    music_folder_id,
    source,
    source_identifier
  ) VALUES ($1, $2, $3, $4)
  ON CONFLICT(music_folder_id, source, source_identifier) DO NOTHING
`

const selectTrackIdentity = `
  SELECT id, music_folder_id, source, source_identifier
  FROM track_identities
  WHERE music_folder_id = $1
    AND source = $2
    AND source_identifier = $3
  LIMIT 1
`

const insertTrack = `
  INSERT INTO tracks (
    library_snapshot_id,
    id,
    music_folder_id,
    source,
    source_identifier,
    path,
    relative_path,
    file_name,
    format,
    title,
    artist,
    album,
    duration_ms,
    metadata_status,
    updated_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12, $13, $14, $15
  )
`

const publishSnapshot = `
  INSERT INTO library_publications (
    library_snapshot_id,
    music_folder_id,
    folder_generation,
    selected_at
  ) VALUES ($1, $2, $3, $4)
`

function rowsFrom(result: unknown): DatabaseRow[] {
  return Array.isArray(result) ? (result as DatabaseRow[]) : []
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function folderGenerationFromRow(row: DatabaseRow): number {
  const generation = row.folder_generation

  if (
    typeof generation !== 'number' ||
    !Number.isSafeInteger(generation) ||
    generation < 1
  ) {
    throw new Error('Stored library publication has an invalid folder generation')
  }

  return generation
}

function folderFromRow(row: DatabaseRow): MusicFolder {
  return {
    id: String(row.folder_id ?? row.id),
    rootPath: String(row.root_path),
    displayName: String(row.display_name),
    selectedAt: nullableString(row.selected_at),
  }
}

function trackFromRow(row: DatabaseRow): PersistedLibraryTrack {
  const fileName = String(row.file_name)
  const storedTitle = nullableString(row.title)?.trim()

  return {
    id: String(row.id),
    musicFolderId: String(row.music_folder_id),
    source: row.source as TrackSource,
    sourceIdentifier: String(row.source_identifier),
    path: String(row.path),
    relativePath: String(row.relative_path),
    fileName,
    format: row.format as AudioFormat,
    title: storedTitle || fallbackTrackTitle(fileName),
    artist: nullableString(row.artist),
    album: nullableString(row.album),
    durationMs:
      typeof row.duration_ms === 'number' ? row.duration_ms : null,
    metadataStatus: row.metadata_status as MetadataStatus,
    updatedAt: nullableString(row.updated_at) ?? '',
  }
}

function trackBindValues(
  track: PersistedLibraryTrack,
  folderId: string,
  snapshotId: string,
): unknown[] {
  return [
    snapshotId,
    track.id,
    folderId,
    track.source,
    track.sourceIdentifier,
    track.path,
    track.relativePath,
    track.fileName,
    track.format,
    track.title,
    track.artist,
    track.album,
    track.durationMs,
    track.metadataStatus,
    track.updatedAt,
  ]
}

function withCommittedIdentity(
  track: PersistedLibraryTrack,
  id: string,
  folderId: string,
): PersistedLibraryTrack {
  return {
    ...track,
    id,
    musicFolderId: folderId,
  }
}

export function createLibraryRepository(
  database: LibraryDatabase,
  dependencies: LibraryRepositoryDependencies = defaultDependencies,
) {
  async function loadTracks(
    snapshotId: string,
  ): Promise<PersistedLibraryTrack[]> {
    const result = await database.select(selectTracksBySnapshot, [snapshotId])
    return rowsFrom(result).map(trackFromRow)
  }

  async function loadLibraryFromSnapshotRow(
    row: DatabaseRow,
  ): Promise<PersistedLibrary> {
    const folder = folderFromRow(row)
    return {
      folderGeneration: folderGenerationFromRow(row),
      folder,
      tracks: await loadTracks(String(row.snapshot_id)),
    }
  }

  async function findFolderIdentityByRootPath(
    rootPath: string,
  ): Promise<DatabaseRow | null> {
    const result = await database.select(selectFolderIdentityByRootPath, [
      rootPath,
    ])
    return rowsFrom(result)[0] ?? null
  }

  return {
    async loadSelectedLibrary(): Promise<PersistedLibrary | null> {
      const result = await database.select(selectSelectedSnapshot)
      const snapshotRow = rowsFrom(result)[0]
      return snapshotRow
        ? loadLibraryFromSnapshotRow(snapshotRow)
        : null
    },

    async loadLibraryByRootPath(
      rootPath: string,
    ): Promise<PersistedLibrary | null> {
      const result = await database.select(selectSnapshotByRootPath, [rootPath])
      const snapshotRow = rowsFrom(result)[0]
      return snapshotRow
        ? loadLibraryFromSnapshotRow(snapshotRow)
        : null
    },

    async saveSelectedLibrary(
      write: SelectedLibraryWrite,
    ): Promise<SelectedLibraryCommit> {
      if (
        !Number.isSafeInteger(write.expectedFolderGeneration) ||
        write.expectedFolderGeneration < 0 ||
        write.expectedFolderGeneration >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error('Expected folder generation must be a safe non-negative integer')
      }

      const existingFolder = await findFolderIdentityByRootPath(
        write.folder.rootPath,
      )
      const proposedFolderId = existingFolder
        ? String(existingFolder.id)
        : write.folder.id

      await database.execute(upsertFolder, [
        proposedFolderId,
        write.folder.rootPath,
        write.folder.displayName,
      ])

      const committedFolder =
        existingFolder ??
        (await findFolderIdentityByRootPath(write.folder.rootPath))
      const folderId = committedFolder
        ? String(committedFolder.id)
        : proposedFolderId
      const snapshotId = crypto.randomUUID()

      await database.execute(insertSnapshot, [snapshotId, folderId])

      const committedTracks: PersistedLibraryTrack[] = []
      for (const track of write.tracks) {
        await database.execute(insertTrackIdentity, [
          track.id,
          folderId,
          track.source,
          track.sourceIdentifier,
        ])
        const identityRows = rowsFrom(
          await database.select(selectTrackIdentity, [
            folderId,
            track.source,
            track.sourceIdentifier,
          ]),
        )
        const identity = identityRows[0]

        if (!identity) {
          throw new Error('Stored Track identity could not be resolved')
        }

        const committedTrack = withCommittedIdentity(
          track,
          String(identity.id),
          folderId,
        )
        committedTracks.push(committedTrack)
        await database.execute(
          insertTrack,
          trackBindValues(committedTrack, folderId, snapshotId),
        )
      }

      const selectedAt = dependencies.now()
      await database.execute(publishSnapshot, [
        snapshotId,
        folderId,
        write.expectedFolderGeneration + 1,
        selectedAt,
      ])
      return {
        folderId,
        selectedAt,
        trackIdsBySourceIdentifier: Object.fromEntries(
          committedTracks.map((track) => [track.sourceIdentifier, track.id]),
        ),
      }
    },
  }
}
