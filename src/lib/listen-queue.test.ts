import { describe, expect, it } from 'vitest'

import type {
  LibrarySnapshot,
  LibraryTrack,
} from './library-ui-state'
import {
  buildListenQueue,
  findAdjacentListenTrack,
} from './listen-queue'

function createTrack(
  id: string,
  relativePath: string,
  presence: LibraryTrack['presence'] = 'present',
): LibraryTrack {
  const fileName = relativePath.split('/').at(-1) ?? relativePath

  return {
    id,
    musicFolderId: 'folder-fixture',
    source: 'local',
    sourceIdentifier: relativePath,
    path: `/fixture-root/${relativePath}`,
    relativePath,
    fileName,
    format: fileName.endsWith('.flac')
      ? 'flac'
      : fileName.endsWith('.mp3')
        ? 'mp3'
        : 'wav',
    title: fileName.replace(/\.[^.]+$/, ''),
    artist: null,
    album: null,
    durationMs: 60_000,
    metadataStatus: 'tagged',
    presence,
  }
}

function createSnapshot(
  tracks: LibraryTrack[],
  access: LibrarySnapshot['access'] = 'granted',
): LibrarySnapshot {
  return {
    folder: {
      id: 'folder-fixture',
      rootPath: '/fixture-root',
      displayName: 'Fixture Root',
      selectedAt: '2026-09-02T00:00:00.000Z',
    },
    access,
    scan: { completeness: 'complete', issues: [] },
    tracks,
  }
}

describe('Listen queue', () => {
  it('uses the visible root-first, folder-depth-first order instead of snapshot order', () => {
    const snapshot = createSnapshot([
      createTrack('nested-c', 'Alpha/Nested/c.wav'),
      createTrack('root-b', 'b-root.wav'),
      createTrack('folder-b', 'Alpha/b.mp3'),
      createTrack('folder-z', 'Zed/z.flac'),
      createTrack('root-a', 'a-root.wav'),
      createTrack('folder-a', 'Alpha/a.mp3'),
    ])

    expect(buildListenQueue(snapshot).map((track) => track.id)).toEqual([
      'root-a',
      'root-b',
      'folder-a',
      'folder-b',
      'nested-c',
      'folder-z',
    ])
  })

  it('excludes unavailable Tracks and all Tracks without current folder permission', () => {
    const tracks = [
      createTrack('present', 'present.wav'),
      createTrack('missing', 'missing.mp3', 'missing'),
      createTrack('unknown', 'unknown.flac', 'unknown'),
    ]

    expect(buildListenQueue(createSnapshot(tracks)).map((track) => track.id))
      .toEqual(['present'])
    expect(
      buildListenQueue(createSnapshot(tracks, 'permission-required')),
    ).toEqual([])
    expect(buildListenQueue(null)).toEqual([])
  })

  it('returns null at queue boundaries and for an unavailable current identity', () => {
    const queue = buildListenQueue(
      createSnapshot([
        createTrack('first', 'first.wav'),
        createTrack('second', 'second.wav'),
      ]),
    )

    expect(findAdjacentListenTrack(queue, 'first', 'previous')).toBeNull()
    expect(findAdjacentListenTrack(queue, 'first', 'next')?.id).toBe('second')
    expect(findAdjacentListenTrack(queue, 'second', 'previous')?.id).toBe(
      'first',
    )
    expect(findAdjacentListenTrack(queue, 'second', 'next')).toBeNull()
    expect(findAdjacentListenTrack(queue, 'missing-id', 'next')).toBeNull()
  })

  it('resolves adjacency by canonical Track identity after a refreshed snapshot', () => {
    const refreshedQueue = buildListenQueue(
      createSnapshot([
        createTrack('stable-current', 'Renamed/current.wav'),
        createTrack('stable-next', 'Renamed/next.wav'),
      ]),
    )

    expect(
      findAdjacentListenTrack(refreshedQueue, 'stable-current', 'next'),
    ).toMatchObject({
      id: 'stable-next',
      relativePath: 'Renamed/next.wav',
    })
  })
})
