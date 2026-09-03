import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir } from '@tauri-apps/plugin-fs'
import Database from '@tauri-apps/plugin-sql'

import {
  scanAudioFolder,
  type AudioFolderScanResult,
  type AudioTrackCandidate,
} from '../lib/audio-library'
import { checkDatabaseRoundTrip } from '../lib/foundation-health'
import {
  createRememberedLibrarySnapshot,
  isSelectedFilesLibrary,
  reconcileLibrarySnapshot,
  selectedFilesLibraryRootPath,
  type LibraryOperationResult,
  type LibrarySnapshot,
  type LibraryTrack,
  type MetadataStatus,
  type MusicFolder,
  type PersistedLibraryTrack,
} from '../lib/library-model'
import {
  createLibraryRepository,
  type PersistedLibrary,
  type SelectedLibraryCommit,
} from '../lib/library-repository'
import { createMarkerRepository } from '../lib/marker-repository'
import { createNoteRepository } from '../lib/note-repository'
import { createPlayEventRepository } from '../lib/play-event-repository'
import { createSearchRepository } from '../lib/search-repository'
import { createSingleFlight } from '../lib/single-flight'
import type { FoundationGateway } from './foundation-gateway'
import { unavailableFoundationGateway } from './foundation-gateway'

const databaseUrl = 'sqlite:loupe-play.db'

type AudioMetadataFailureKind =
  | 'scope-denied'
  | 'outside-root'
  | 'symlink'
  | 'not-regular-file'
  | 'unsupported-format'
  | 'unreadable'
  | 'invalid-tags'
  | 'invalid-metadata'
  | 'missing-tags'

interface AudioMetadataResult {
  index: number
  title: string
  artist: string | null
  album: string | null
  durationMs: number | null
  status: MetadataStatus
  failureKind?: AudioMetadataFailureKind
}

const audioMetadataFailureKinds = new Set<AudioMetadataFailureKind>([
  'scope-denied',
  'outside-root',
  'symlink',
  'not-regular-file',
  'unsupported-format',
  'unreadable',
  'invalid-tags',
  'invalid-metadata',
  'missing-tags',
])

const nonPlayableMetadataFailures = new Set<AudioMetadataFailureKind>([
  'scope-denied',
  'outside-root',
  'symlink',
  'not-regular-file',
  'unsupported-format',
  'unreadable',
  'invalid-metadata',
])

const getDatabase = () => Database.get(databaseUrl)

const checkDatabase = createSingleFlight(() =>
  checkDatabaseRoundTrip({
    createProbe: () => `loupe-play-${crypto.randomUUID()}`,
    getDatabase,
    now: () => new Date().toISOString(),
  }),
)

function createFolder(rootPath: string): MusicFolder {
  const withoutTrailingSeparator = rootPath.replace(/[\\/]+$/, '')
  const displayName =
    withoutTrailingSeparator.split(/[\\/]/).filter(Boolean).at(-1) ??
    rootPath

  return {
    id: crypto.randomUUID(),
    rootPath,
    displayName,
    selectedAt: null,
  }
}

function createSelectedFilesFolder(): MusicFolder {
  return {
    id: crypto.randomUUID(),
    rootPath: selectedFilesLibraryRootPath,
    displayName: '選択した曲',
    selectedAt: null,
  }
}

function selectedFileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function selectedFilesScan(paths: string[]): AudioFolderScanResult {
  const seen = new Set<string>()
  const tracks = paths.flatMap((path) => {
    if (seen.has(path)) {
      return []
    }

    seen.add(path)
    const name = selectedFileName(path)
    if (!/\.(?:wav|mp3|flac)$/i.test(name)) {
      return []
    }

    return [{ name, path, relativePath: path }]
  })

  return { completeness: 'complete', issues: [], tracks }
}

function fallbackTitle(fileName: string): string {
  const extensionStart = fileName.lastIndexOf('.')
  return extensionStart > 0 ? fileName.slice(0, extensionStart) : fileName
}

function sanitizedText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function sanitizedDuration(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null
}

function validatedMetadataResults(
  value: unknown,
  candidates: AudioTrackCandidate[],
): AudioMetadataResult[] {
  if (!Array.isArray(value) || value.length !== candidates.length) {
    throw new Error('Audio metadata response did not match the scan')
  }

  const results = new Array<AudioMetadataResult>(candidates.length)

  for (const entry of value) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('index' in entry) ||
      typeof entry.index !== 'number' ||
      !Number.isSafeInteger(entry.index) ||
      entry.index < 0 ||
      entry.index >= candidates.length ||
      results[entry.index]
    ) {
      throw new Error('Audio metadata response contained an invalid index')
    }

    const candidate = candidates[entry.index]
    if (
      !('status' in entry) ||
      (entry.status !== 'tagged' && entry.status !== 'fallback')
    ) {
      throw new Error('Audio metadata response contained an invalid status')
    }

    const failureKind =
      'failureKind' in entry && entry.failureKind !== undefined
        ? entry.failureKind
        : undefined
    if (
      failureKind !== undefined &&
      (typeof failureKind !== 'string' ||
        !audioMetadataFailureKinds.has(
          failureKind as AudioMetadataFailureKind,
        ))
    ) {
      throw new Error(
        'Audio metadata response contained an invalid failure kind',
      )
    }
    if (entry.status === 'tagged' && failureKind !== undefined) {
      throw new Error(
        'Audio metadata response combined a tag with a failure kind',
      )
    }
    if (entry.status === 'fallback' && failureKind === undefined) {
      throw new Error(
        'Audio metadata response contained fallback status without a failure kind',
      )
    }

    results[entry.index] = {
      index: entry.index,
      title:
        ('title' in entry ? sanitizedText(entry.title) : null) ??
        fallbackTitle(candidate.name),
      artist:
        'artist' in entry ? sanitizedText(entry.artist) : null,
      album: 'album' in entry ? sanitizedText(entry.album) : null,
      durationMs:
        'durationMs' in entry
          ? sanitizedDuration(entry.durationMs)
          : null,
      status: entry.status,
      ...(failureKind
        ? { failureKind: failureKind as AudioMetadataFailureKind }
        : {}),
    }
  }

  if (results.some((result) => !result)) {
    throw new Error('Audio metadata response omitted a scan result')
  }

  return results
}

function applyMetadata(
  snapshot: LibrarySnapshot,
  scan: AudioFolderScanResult,
  metadata: AudioMetadataResult[],
): LibrarySnapshot {
  const byIdentifier = new Map(
    scan.tracks.map((candidate, index) => [
      candidate.relativePath,
      metadata[index],
    ]),
  )

  return {
    ...snapshot,
    tracks: snapshot.tracks.map((track) => {
      const result = byIdentifier.get(track.sourceIdentifier)

      if (!result) {
        return track
      }

      if (
        result.failureKind &&
        nonPlayableMetadataFailures.has(result.failureKind)
      ) {
        return { ...track, presence: 'unknown' as const }
      }

      return {
        ...track,
        title: result.title,
        artist: result.artist,
        album: result.album,
        durationMs: result.durationMs,
        metadataStatus: result.status,
      }
    }),
  }
}

function withoutPresence(
  track: LibraryTrack,
  updatedAt: string,
): PersistedLibraryTrack {
  return {
    id: track.id,
    musicFolderId: track.musicFolderId,
    source: track.source,
    sourceIdentifier: track.sourceIdentifier,
    path: track.path,
    relativePath: track.relativePath,
    fileName: track.fileName,
    format: track.format,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    metadataStatus: track.metadataStatus,
    updatedAt: track.updatedAt ?? updatedAt,
  }
}

function rememberedSnapshot(
  persisted: PersistedLibrary | null,
  rootPath: string,
): LibrarySnapshot {
  return persisted
    ? createRememberedLibrarySnapshot(persisted.folder, persisted.tracks)
    : createRememberedLibrarySnapshot(createFolder(rootPath), [])
}

export function applyCommittedLibraryIdentity(
  snapshot: LibrarySnapshot,
  commit: SelectedLibraryCommit,
): LibrarySnapshot {
  const tracks = snapshot.tracks.map((track) => {
    const hasCanonicalTrackId = Object.hasOwn(
      commit.trackIdsBySourceIdentifier,
      track.sourceIdentifier,
    )
    const canonicalTrackId = hasCanonicalTrackId
      ? commit.trackIdsBySourceIdentifier[track.sourceIdentifier]
      : undefined

    if (
      typeof canonicalTrackId !== 'string' ||
      canonicalTrackId.trim().length === 0
    ) {
      throw new Error('Committed library omitted a canonical Track identity')
    }

    return {
      ...track,
      id: canonicalTrackId,
      musicFolderId: commit.folderId,
    }
  })

  return {
    ...snapshot,
    folder: {
      ...snapshot.folder,
      id: commit.folderId,
      selectedAt: commit.selectedAt,
    },
    tracks,
  }
}

async function indexSelectedFolder(
  rootPath: string,
): Promise<
  Extract<LibraryOperationResult, { kind: 'committed' }>
> {
  const database = getDatabase()
  const repository = createLibraryRepository(database)
  const persisted = await repository.loadLibraryByRootPath(rootPath)
  const expectedFolderGeneration = persisted?.folderGeneration ?? 0
  const remembered = rememberedSnapshot(persisted, rootPath)
  const scan = await scanAudioFolder(rootPath, {
    joinPath: join,
    readDirectory: readDir,
  })
  const rawMetadata = await invoke<unknown>('read_audio_metadata', {
    root: rootPath,
    paths: scan.tracks.map((track) => track.path),
  })
  const metadata = validatedMetadataResults(rawMetadata, scan.tracks)
  const observedAt = new Date().toISOString()
  const reconciled = applyMetadata(
    reconcileLibrarySnapshot(remembered, scan, {
      createTrackId: () => crypto.randomUUID(),
      now: () => observedAt,
    }),
    scan,
    metadata,
  )
  const commit = await repository.saveSelectedLibrary({
    folder: {
      id: reconciled.folder.id,
      rootPath: reconciled.folder.rootPath,
      displayName: reconciled.folder.displayName,
    },
    tracks: reconciled.tracks.map((track) =>
      withoutPresence(track, observedAt),
    ),
    expectedFolderGeneration,
  })

  return {
    kind: 'committed',
    snapshot: applyCommittedLibraryIdentity(reconciled, commit),
  }
}

async function indexSelectedFiles(
  paths: string[],
  options: {
    persisted?: PersistedLibrary
    replaceSelection?: boolean
  } = {},
): Promise<
  Extract<LibraryOperationResult, { kind: 'committed' }>
> {
  const database = getDatabase()
  const repository = createLibraryRepository(database)
  const persisted =
    options.persisted ??
    (await repository.loadLibraryByRootPath(
      selectedFilesLibraryRootPath,
    ))
  const expectedFolderGeneration = persisted?.folderGeneration ?? 0
  const folder = persisted?.folder ?? createSelectedFilesFolder()
  const remembered = createRememberedLibrarySnapshot(
    folder,
    options.replaceSelection ? [] : (persisted?.tracks ?? []),
  )
  const scan = selectedFilesScan(paths)

  if (scan.tracks.length === 0) {
    throw new Error('No supported audio files were selected')
  }

  const rawMetadata = await invoke<unknown>(
    'read_selected_audio_metadata',
    { paths: scan.tracks.map((track) => track.path) },
  )
  const metadata = validatedMetadataResults(rawMetadata, scan.tracks)

  if (metadata.some((result) => result.failureKind === 'scope-denied')) {
    throw new Error('Selected audio scope is unavailable')
  }

  const observedAt = new Date().toISOString()
  const reconciled = applyMetadata(
    reconcileLibrarySnapshot(remembered, scan, {
      createTrackId: () => crypto.randomUUID(),
      now: () => observedAt,
    }),
    scan,
    metadata,
  )
  const displaySnapshot: LibrarySnapshot = {
    ...reconciled,
    tracks: reconciled.tracks.map((track) => ({
      ...track,
      relativePath: track.fileName,
    })),
  }
  const commit = await repository.saveSelectedLibrary({
    folder: {
      id: displaySnapshot.folder.id,
      rootPath: displaySnapshot.folder.rootPath,
      displayName: displaySnapshot.folder.displayName,
    },
    tracks: displaySnapshot.tracks.map((track) =>
      withoutPresence(track, observedAt),
    ),
    expectedFolderGeneration,
  })

  return {
    kind: 'committed',
    snapshot: applyCommittedLibraryIdentity(displaySnapshot, commit),
  }
}

async function chooseFolder(
  defaultPath?: string,
): Promise<LibraryOperationResult> {
  const selection = await open({
    ...(defaultPath ? { defaultPath } : {}),
    directory: true,
    multiple: false,
    recursive: true,
    title: defaultPath
      ? 'LoupePlay の音楽フォルダを再接続する'
      : 'LoupePlay で開く音楽フォルダを選ぶ',
  })

  return typeof selection === 'string'
    ? indexSelectedFolder(selection)
    : { kind: 'cancelled' }
}

async function chooseFiles(
  defaultPath?: string,
): Promise<LibraryOperationResult> {
  const selection = await open({
    ...(defaultPath ? { defaultPath } : {}),
    directory: false,
    multiple: true,
    filters: [
      { name: '音楽ファイル', extensions: ['wav', 'mp3', 'flac'] },
    ],
    title: defaultPath
      ? 'LoupePlay の音楽ファイルを選び直す'
      : 'LoupePlay で開く音楽ファイルを選ぶ',
  })
  const paths = Array.isArray(selection)
    ? selection
    : typeof selection === 'string'
      ? [selection]
      : []

  return paths.length > 0
    ? indexSelectedFiles(paths, { replaceSelection: true })
    : { kind: 'cancelled' }
}

const loadLibrary = createSingleFlight(async () => {
  const persisted = await createLibraryRepository(
    getDatabase(),
  ).loadSelectedLibrary()

  if (!persisted) {
    return null
  }

  try {
    const reopened = isSelectedFilesLibrary(persisted.folder)
      ? await indexSelectedFiles(
          persisted.tracks.map((track) => track.path),
          { persisted },
        )
      : await indexSelectedFolder(persisted.folder.rootPath)
    return reopened.snapshot
  } catch {
    return createRememberedLibrarySnapshot(
      persisted.folder,
      persisted.tracks,
    )
  }
})

export const tauriFoundationGateway: FoundationGateway = {
  runtime: 'desktop',
  checkDatabase,
  loadLibrary,
  chooseMusicFolder: () => chooseFolder(),
  chooseMusicFiles: () => chooseFiles(),
  reconnectMusicFolder: async (folderId) => {
    const persisted = await createLibraryRepository(
      getDatabase(),
    ).loadSelectedLibrary()

    if (!persisted || persisted.folder.id !== folderId) {
      throw new Error('Saved music folder is unavailable')
    }

    return isSelectedFilesLibrary(persisted.folder)
      ? chooseFiles(persisted.tracks[0]?.path)
      : chooseFolder(persisted.folder.rootPath)
  },
  toAudioUrl: convertFileSrc,
  loadMarkers: (trackId) =>
    createMarkerRepository(getDatabase()).loadMarkers(trackId),
  createMarker: (input) =>
    createMarkerRepository(getDatabase()).createMarker(input),
  updateMarker: (input) =>
    createMarkerRepository(getDatabase()).updateMarker(input),
  deleteMarker: (input) =>
    createMarkerRepository(getDatabase()).deleteMarker(input),
  restoreMarker: (input) =>
    createMarkerRepository(getDatabase()).restoreMarker(input),
  loadTrackNotes: (trackId) =>
    createNoteRepository(getDatabase()).loadTrackNotes(trackId),
  loadListeningNotes: (trackId) =>
    createNoteRepository(getDatabase()).loadListeningNotes(trackId),
  createTrackNote: (input) =>
    createNoteRepository(getDatabase()).createTrackNote(input),
  createListeningNote: (input) =>
    createNoteRepository(getDatabase()).createListeningNote(input),
  updateTrackNote: (input) =>
    createNoteRepository(getDatabase()).updateTrackNote(input),
  updateListeningNote: (input) =>
    createNoteRepository(getDatabase()).updateListeningNote(input),
  deleteTrackNote: (input) =>
    createNoteRepository(getDatabase()).deleteTrackNote(input),
  deleteListeningNote: (input) =>
    createNoteRepository(getDatabase()).deleteListeningNote(input),
  restoreTrackNote: (input) =>
    createNoteRepository(getDatabase()).restoreTrackNote(input),
  restoreListeningNote: (input) =>
    createNoteRepository(getDatabase()).restoreListeningNote(input),
  loadPlayEvents: (trackId) =>
    createPlayEventRepository(getDatabase()).loadPlayEvents(trackId),
  startPlayEvent: (input) =>
    createPlayEventRepository(getDatabase()).startPlayEvent(input),
  closePlayEvent: (input) =>
    createPlayEventRepository(getDatabase()).closePlayEvent(input),
  searchNotes: (query) =>
    createSearchRepository(getDatabase()).searchNotes(query),
}

export const runtimeFoundationGateway = isTauri()
  ? tauriFoundationGateway
  : unavailableFoundationGateway
