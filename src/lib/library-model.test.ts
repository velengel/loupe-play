import { describe, expect, it, vi } from 'vitest'

import {
  buildLibraryTree,
  createRememberedLibrarySnapshot,
  reconcileLibrarySnapshot,
} from './library-model'

const folder = {
  id: 'folder-1',
  rootPath: '/Library',
  displayName: 'Library',
  selectedAt: '2026-09-01T00:00:00.000Z',
}

const storedTracks = [
  {
    id: 'track-existing',
    musicFolderId: 'folder-1',
    source: 'local' as const,
    sourceIdentifier: 'session/take.FLAC',
    path: '/Library/session/take.FLAC',
    relativePath: 'session/take.FLAC',
    fileName: 'take.FLAC',
    format: 'flac' as const,
    title: 'Tagged take',
    artist: 'An Artist',
    album: null,
    durationMs: 12_345,
    metadataStatus: 'tagged' as const,
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'track-unseen',
    musicFolderId: 'folder-1',
    source: 'local' as const,
    sourceIdentifier: 'old/song.mp3',
    path: '/Library/old/song.mp3',
    relativePath: 'old/song.mp3',
    fileName: 'song.mp3',
    format: 'mp3' as const,
    title: 'Old song',
    artist: null,
    album: null,
    durationMs: null,
    metadataStatus: 'fallback' as const,
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
]

describe('remembered library snapshots', () => {
  it('requires permission and treats every persisted Track presence as unknown', () => {
    const snapshot = createRememberedLibrarySnapshot(folder, storedTracks)

    expect(snapshot.access).toBe('permission-required')
    expect(snapshot.scan).toEqual({ completeness: 'not-run', issues: [] })
    expect(snapshot.tracks).toEqual(
      storedTracks.map((track) => ({ ...track, presence: 'unknown' })),
    )
  })
})

describe('library reconciliation', () => {
  it('preserves a Track id, adds a filename fallback, and marks unseen Tracks missing after a complete scan', () => {
    const createTrackId = vi.fn().mockReturnValue('track-new')
    const remembered = createRememberedLibrarySnapshot(folder, storedTracks)

    const snapshot = reconcileLibrarySnapshot(
      remembered,
      {
        completeness: 'complete',
        issues: [],
        tracks: [
          {
            name: 'take.FLAC',
            path: '/Library/session/take.FLAC',
            relativePath: 'session/take.FLAC',
          },
          {
            name: 'rough.mix.v2.MP3',
            path: '/Library/drafts/rough.mix.v2.MP3',
            relativePath: 'drafts/rough.mix.v2.MP3',
          },
        ],
      },
      {
        createTrackId,
        now: () => '2026-09-02T00:00:00.000Z',
      },
    )

    expect(snapshot.access).toBe('granted')
    expect(snapshot.scan.completeness).toBe('complete')
    expect(snapshot.tracks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'track-existing',
          sourceIdentifier: 'session/take.FLAC',
          presence: 'present',
          title: 'Tagged take',
        }),
        expect.objectContaining({
          id: 'track-unseen',
          presence: 'missing',
        }),
        expect.objectContaining({
          id: 'track-new',
          musicFolderId: 'folder-1',
          source: 'local',
          sourceIdentifier: 'drafts/rough.mix.v2.MP3',
          relativePath: 'drafts/rough.mix.v2.MP3',
          fileName: 'rough.mix.v2.MP3',
          format: 'mp3',
          title: 'rough.mix.v2',
          artist: null,
          album: null,
          durationMs: null,
          metadataStatus: 'fallback',
          presence: 'present',
        }),
      ]),
    )
    expect(createTrackId).toHaveBeenCalledOnce()
  })

  it('does not infer missing Tracks from a partial scan', () => {
    const remembered = createRememberedLibrarySnapshot(folder, storedTracks)

    const snapshot = reconcileLibrarySnapshot(
      remembered,
      {
        completeness: 'partial',
        issues: [
          { kind: 'directory-unreadable', relativePath: 'old' as const },
        ],
        tracks: [
          {
            name: 'take.FLAC',
            path: '/Library/session/take.FLAC',
            relativePath: 'session/take.FLAC',
          },
        ],
      },
      {
        createTrackId: () => 'unused',
        now: () => '2026-09-02T00:00:00.000Z',
      },
    )

    expect(snapshot.scan.completeness).toBe('partial')
    expect(snapshot.tracks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'track-existing',
          presence: 'present',
        }),
        expect.objectContaining({
          id: 'track-unseen',
          presence: 'unknown',
        }),
      ]),
    )
    expect(snapshot.tracks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'track-unseen',
          presence: 'missing',
        }),
      ]),
    )
  })
})

describe('library tree', () => {
  it('builds nested folders from canonical relative paths', () => {
    const remembered = createRememberedLibrarySnapshot(folder, [
      storedTracks[0],
      {
        ...storedTracks[1],
        id: 'track-root',
        sourceIdentifier: 'root.wav',
        path: '/Library/root.wav',
        relativePath: 'root.wav',
        fileName: 'root.wav',
      },
      {
        ...storedTracks[1],
        id: 'track-deep',
        sourceIdentifier: 'session/day-1/deep.mp3',
        path: '/Library/session/day-1/deep.mp3',
        relativePath: 'session/day-1/deep.mp3',
        fileName: 'deep.mp3',
      },
    ])

    const tree = buildLibraryTree(remembered.tracks)
    const session = tree.folders.find((entry) => entry.name === 'session')
    const dayOne = session?.folders.find((entry) => entry.name === 'day-1')

    expect(tree.relativePath).toBe('')
    expect(tree.tracks.map((track) => track.id)).toEqual(['track-root'])
    expect(session?.relativePath).toBe('session')
    expect(session?.tracks.map((track) => track.id)).toEqual([
      'track-existing',
    ])
    expect(dayOne?.relativePath).toBe('session/day-1')
    expect(dayOne?.tracks.map((track) => track.id)).toEqual(['track-deep'])
  })
})
