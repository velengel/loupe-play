export interface AudioTrackCandidate {
  name: string
  path: string
}

export interface ScannedAudioTrackCandidate extends AudioTrackCandidate {
  relativePath: string
}

export interface AudioFolderScanIssue {
  kind: 'directory-unreadable'
  relativePath: string
}

export interface AudioFolderScanResult {
  completeness: 'complete' | 'partial'
  issues: AudioFolderScanIssue[]
  tracks: ScannedAudioTrackCandidate[]
}

export interface DirectoryEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
  isSymlink: boolean
}

interface AudioFolderDependencies {
  joinPath: (...parts: string[]) => Promise<string>
  readDirectory: (path: string) => Promise<DirectoryEntry[]>
}

const supportedAudioExtension = /\.(?:wav|mp3|flac)$/i

export function isSupportedAudioPath(path: string): boolean {
  return supportedAudioExtension.test(path)
}

export async function scanAudioFolder(
  root: string,
  dependencies: AudioFolderDependencies,
): Promise<AudioFolderScanResult> {
  const tracks: ScannedAudioTrackCandidate[] = []
  const issues: AudioFolderScanIssue[] = []

  async function visit(
    directory: string,
    relativeSegments: string[],
    isRoot: boolean,
  ): Promise<void> {
    let entries: DirectoryEntry[]

    try {
      entries = await dependencies.readDirectory(directory)
    } catch (error) {
      if (isRoot) {
        throw error
      }

      issues.push({
        kind: 'directory-unreadable',
        relativePath: relativeSegments.join('/'),
      })
      return
    }

    for (const entry of entries) {
      if (entry.isSymlink) {
        continue
      }

      const path = await dependencies.joinPath(directory, entry.name)
      const entrySegments = [...relativeSegments, entry.name]

      if (entry.isDirectory) {
        await visit(path, entrySegments, false)
        continue
      }

      if (entry.isFile && isSupportedAudioPath(entry.name)) {
        tracks.push({
          name: entry.name,
          path,
          relativePath: entrySegments.join('/'),
        })
      }
    }
  }

  await visit(root, [], true)

  return {
    completeness: issues.length === 0 ? 'complete' : 'partial',
    issues,
    tracks: tracks.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath, 'en', {
        sensitivity: 'base',
      }),
    ),
  }
}
