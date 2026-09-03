import { describe, expect, it } from 'vitest'

import {
  createInitialLibraryUiState,
  isTrackSelectable,
  libraryUiReducer,
  resolveSelectedTrack,
  type LibrarySnapshot,
  type LibraryTrack,
} from './library-ui-state'

function createTrack(
  overrides: Partial<LibraryTrack> = {},
): LibraryTrack {
  return {
    id: 'track-fixture-a',
    musicFolderId: 'folder-fixture',
    source: 'local',
    sourceIdentifier: 'session/fixture-take.mp3',
    path: '/fixture-music/session/fixture-take.mp3',
    relativePath: 'session/fixture-take.mp3',
    fileName: 'fixture-take.mp3',
    format: 'mp3',
    title: 'Fixture Take',
    artist: null,
    album: null,
    durationMs: 65_000,
    metadataStatus: 'tagged',
    presence: 'present',
    ...overrides,
  }
}

function createSnapshot(
  overrides: {
    access?: 'granted' | 'permission-required'
    completeness?: 'complete' | 'partial' | null
    displayName?: string
    issueCount?: number
    tracks?: LibraryTrack[]
  } = {},
): LibrarySnapshot {
  return {
    folder: {
      id: 'folder-fixture',
      rootPath: '/fixture-music',
      displayName: overrides.displayName ?? 'Fixture Music',
      selectedAt: '2026-09-02T00:00:00.000Z',
    },
    access: overrides.access ?? 'granted',
    tracks: overrides.tracks ?? [createTrack()],
    scan: {
      completeness: overrides.completeness ?? 'not-run',
      issues: Array.from(
        { length: overrides.issueCount ?? 0 },
        () => ({
          kind: 'directory-unreadable' as const,
          relativePath: 'fixture-unreadable',
        }),
      ),
    },
  }
}

function hydrate(snapshot: LibrarySnapshot) {
  let state = createInitialLibraryUiState()
  state = libraryUiReducer(state, {
    type: 'hydrate-started',
    operationId: 1,
  })
  state = libraryUiReducer(state, {
    type: 'hydrate-committed',
    operationId: 1,
    snapshot,
  })
  return state
}

describe('libraryUiReducer', () => {
  it('ignores a delayed hydrate result after a newer snapshot is committed', () => {
    const hydratedSnapshot = createSnapshot({ displayName: 'Old Library' })
    const scannedSnapshot = createSnapshot({
      completeness: 'complete',
      displayName: 'Current Library',
    })
    let state = createInitialLibraryUiState()

    state = libraryUiReducer(state, {
      type: 'hydrate-started',
      operationId: 1,
    })
    state = libraryUiReducer(state, {
      type: 'operation-started',
      operation: 'scan',
      operationId: 2,
    })
    state = libraryUiReducer(state, {
      type: 'snapshot-committed',
      operationId: 2,
      snapshot: scannedSnapshot,
    })
    state = libraryUiReducer(state, {
      type: 'hydrate-committed',
      operationId: 1,
      snapshot: hydratedSnapshot,
    })

    expect(state.snapshot).toBe(scannedSnapshot)
    expect(state.snapshot?.folder.displayName).toBe('Current Library')
  })

  it('keeps the stable snapshot and selected track after cancellation and failure', () => {
    const snapshot = createSnapshot()
    let state = hydrate(snapshot)
    state = libraryUiReducer(state, {
      type: 'track-selected',
      trackId: 'track-fixture-a',
    })

    state = libraryUiReducer(state, {
      type: 'operation-started',
      operation: 'scan',
      operationId: 2,
    })
    state = libraryUiReducer(state, {
      type: 'operation-cancelled',
      operationId: 2,
    })

    expect(state.snapshot).toBe(snapshot)
    expect(state.selectedTrackId).toBe('track-fixture-a')

    state = libraryUiReducer(state, {
      type: 'operation-started',
      operation: 'scan',
      operationId: 3,
    })
    state = libraryUiReducer(state, {
      type: 'operation-failed',
      operationId: 3,
    })

    expect(state.snapshot).toBe(snapshot)
    expect(state.selectedTrackId).toBe('track-fixture-a')
  })

  it('resolves a selected Track id against the latest committed snapshot', () => {
    const initialTrack = createTrack()
    const updatedTrack = createTrack({
      path: '/reconnected-fixture/session/fixture-take.mp3',
      title: 'Updated Fixture Take',
    })
    let state = hydrate(createSnapshot({ tracks: [initialTrack] }))
    state = libraryUiReducer(state, {
      type: 'track-selected',
      trackId: initialTrack.id,
    })
    state = libraryUiReducer(state, {
      type: 'operation-started',
      operation: 'reconnect',
      operationId: 2,
    })
    state = libraryUiReducer(state, {
      type: 'snapshot-committed',
      operationId: 2,
      snapshot: createSnapshot({
        completeness: 'complete',
        tracks: [updatedTrack],
      }),
    })

    expect(state.selectedTrackId).toBe(initialTrack.id)
    expect(resolveSelectedTrack(state)).toEqual(updatedTrack)
    expect(resolveSelectedTrack(state)?.path).not.toBe(initialTrack.path)
  })

  it.each([
    ['permission-required', 'present'],
    ['granted', 'missing'],
    ['granted', 'unknown'],
  ] as const)(
    'does not select a Track when folder access is %s and presence is %s',
    (access, presence) => {
      const track = createTrack({ presence })
      let state = hydrate(createSnapshot({ access, tracks: [track] }))

      expect(isTrackSelectable(state.snapshot, track)).toBe(false)

      state = libraryUiReducer(state, {
        type: 'track-selected',
        trackId: track.id,
      })

      expect(state.selectedTrackId).toBeNull()
      expect(resolveSelectedTrack(state)).toBeNull()
    },
  )

  it.each([
    ['permission-required', 'present'],
    ['granted', 'missing'],
    ['granted', 'unknown'],
  ] as const)(
    'clears the selected Track when a commit changes access to %s and presence to %s',
    (access, presence) => {
      const selectedTrack = createTrack()
      let state = hydrate(createSnapshot({ tracks: [selectedTrack] }))
      state = libraryUiReducer(state, {
        type: 'track-selected',
        trackId: selectedTrack.id,
      })
      state = libraryUiReducer(state, {
        type: 'operation-started',
        operation: 'scan',
        operationId: 2,
      })
      state = libraryUiReducer(state, {
        type: 'snapshot-committed',
        operationId: 2,
        snapshot: createSnapshot({
          access,
          completeness: presence === 'unknown' ? 'partial' : 'complete',
          issueCount: presence === 'unknown' ? 1 : 0,
          tracks: [createTrack({ presence })],
        }),
      })

      expect(state.selectedTrackId).toBeNull()
      expect(resolveSelectedTrack(state)).toBeNull()
    },
  )
})
