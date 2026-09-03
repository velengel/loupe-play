import type {
  AudioFolderScanIssue,
  AudioFolderScanResult,
  ScannedAudioTrackCandidate,
} from './audio-library'

export type LibraryAccess = 'granted' | 'permission-required'
export type LibraryScanCompleteness = 'not-run' | 'complete' | 'partial'
export type TrackPresence = 'present' | 'missing' | 'unknown'
export type TrackSource = 'local'
export type AudioFormat = 'wav' | 'mp3' | 'flac'
export type MetadataStatus = 'tagged' | 'fallback'

export const selectedFilesLibraryRootPath =
  'loupe-play:selected-files:v1'

export function isSelectedFilesLibrary(folder: MusicFolder): boolean {
  return folder.rootPath === selectedFilesLibraryRootPath
}

export interface MusicFolder {
  id: string
  rootPath: string
  displayName: string
  selectedAt: string | null
}

export interface PersistedLibraryTrack {
  id: string
  musicFolderId: string
  source: TrackSource
  sourceIdentifier: string
  path: string
  relativePath: string
  fileName: string
  format: AudioFormat
  title: string
  artist: string | null
  album: string | null
  durationMs: number | null
  metadataStatus: MetadataStatus
  updatedAt: string
}

export interface LibraryTrack
  extends Omit<PersistedLibraryTrack, 'updatedAt'> {
  updatedAt?: string
  presence: TrackPresence
}

export interface LibrarySnapshot {
  folder: MusicFolder
  access: LibraryAccess
  scan: {
    completeness: LibraryScanCompleteness
    issues: AudioFolderScanIssue[]
  }
  tracks: LibraryTrack[]
}

export type LibraryOperationResult =
  | { kind: 'cancelled' }
  | { kind: 'committed'; snapshot: LibrarySnapshot }

interface ReconciliationDependencies {
  createTrackId: () => string
  now: () => string
}

export interface LibraryFolderTree {
  name: string
  relativePath: string
  folders: LibraryFolderTree[]
  tracks: LibraryTrack[]
}

function audioFormatFromFileName(fileName: string): AudioFormat {
  const extension = fileName.match(/\.([^.]+)$/)?.[1]?.toLowerCase()

  if (extension === 'wav' || extension === 'mp3' || extension === 'flac') {
    return extension
  }

  throw new Error('Scanned Track has an unsupported audio format')
}

export function fallbackTrackTitle(fileName: string): string {
  const extensionStart = fileName.lastIndexOf('.')
  return extensionStart > 0 ? fileName.slice(0, extensionStart) : fileName
}

function createFallbackTrack(
  folderId: string,
  candidate: ScannedAudioTrackCandidate,
  dependencies: ReconciliationDependencies,
  updatedAt: string,
): LibraryTrack {
  return {
    id: dependencies.createTrackId(),
    musicFolderId: folderId,
    source: 'local',
    sourceIdentifier: candidate.relativePath,
    path: candidate.path,
    relativePath: candidate.relativePath,
    fileName: candidate.name,
    format: audioFormatFromFileName(candidate.name),
    title: fallbackTrackTitle(candidate.name),
    artist: null,
    album: null,
    durationMs: null,
    metadataStatus: 'fallback',
    updatedAt,
    presence: 'present',
  }
}

export function createRememberedLibrarySnapshot(
  folder: MusicFolder,
  tracks: PersistedLibraryTrack[],
): LibrarySnapshot {
  return {
    folder: { ...folder },
    access: 'permission-required',
    scan: { completeness: 'not-run', issues: [] },
    tracks: tracks.map((track) => ({ ...track, presence: 'unknown' })),
  }
}

export function reconcileLibrarySnapshot(
  remembered: LibrarySnapshot,
  scan: AudioFolderScanResult,
  dependencies: ReconciliationDependencies,
): LibrarySnapshot {
  const updatedAt = dependencies.now()
  const rememberedByIdentifier = new Map(
    remembered.tracks.map((track) => [track.sourceIdentifier, track]),
  )
  const seenIdentifiers = new Set<string>()
  const presentTracks = scan.tracks.map((candidate) => {
    const sourceIdentifier = candidate.relativePath
    const existing = rememberedByIdentifier.get(sourceIdentifier)
    seenIdentifiers.add(sourceIdentifier)

    if (!existing) {
      return createFallbackTrack(
        remembered.folder.id,
        candidate,
        dependencies,
        updatedAt,
      )
    }

    return {
      ...existing,
      path: candidate.path,
      relativePath: candidate.relativePath,
      fileName: candidate.name,
      format: audioFormatFromFileName(candidate.name),
      sourceIdentifier,
      updatedAt,
      presence: 'present' as const,
    }
  })
  const unseenPresence: TrackPresence =
    scan.completeness === 'complete' ? 'missing' : 'unknown'
  const unseenTracks = remembered.tracks
    .filter((track) => !seenIdentifiers.has(track.sourceIdentifier))
    .map((track) => ({ ...track, presence: unseenPresence }))

  return {
    folder: { ...remembered.folder },
    access: 'granted',
    scan: {
      completeness: scan.completeness,
      issues: scan.issues.map((issue) => ({ ...issue })),
    },
    tracks: [...presentTracks, ...unseenTracks],
  }
}

export function buildLibraryTree(
  tracks: LibraryTrack[],
): LibraryFolderTree {
  const root: LibraryFolderTree = {
    name: '',
    relativePath: '',
    folders: [],
    tracks: [],
  }

  for (const track of tracks) {
    const directorySegments = track.relativePath.split('/').slice(0, -1)
    let current = root

    for (const segment of directorySegments) {
      if (segment.length === 0) {
        continue
      }

      let child = current.folders.find((folder) => folder.name === segment)

      if (!child) {
        const relativePath = current.relativePath
          ? `${current.relativePath}/${segment}`
          : segment
        child = { name: segment, relativePath, folders: [], tracks: [] }
        current.folders.push(child)
      }

      current = child
    }

    current.tracks.push(track)
  }

  function sortTree(node: LibraryFolderTree): void {
    node.folders.sort((left, right) =>
      left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }),
    )
    node.tracks.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath, 'en', {
        sensitivity: 'base',
      }),
    )
    node.folders.forEach(sortTree)
  }

  sortTree(root)
  return root
}
