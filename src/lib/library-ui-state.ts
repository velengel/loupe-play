import type {
  LibrarySnapshot as StoredLibrarySnapshot,
  LibraryTrack as StoredLibraryTrack,
} from './library-model'

// The UI never reads the persistence timestamp. Keeping it optional here lets
// callers provide a projection without inventing a storage concern.
export interface LibraryTrack extends Omit<StoredLibraryTrack, 'updatedAt'> {
  updatedAt?: string
}

export interface LibrarySnapshot
  extends Omit<StoredLibrarySnapshot, 'tracks'> {
  tracks: LibraryTrack[]
}

export type LibraryUiOperation = 'hydrate' | 'reconnect' | 'scan'

export interface LibraryUiState {
  snapshot: LibrarySnapshot | null
  selectedTrackId: string | null
  operation: LibraryUiOperation | null
  operationId: number
  hydrated: boolean
  error: LibraryUiOperation | null
}

type LibraryUiAction =
  | { type: 'hydrate-started'; operationId: number }
  | {
      type: 'hydrate-committed'
      operationId: number
      snapshot: LibrarySnapshot | null
    }
  | {
      type: 'operation-started'
      operationId: number
      operation: Exclude<LibraryUiOperation, 'hydrate'>
    }
  | {
      type: 'snapshot-committed'
      operationId: number
      snapshot: LibrarySnapshot
    }
  | { type: 'operation-cancelled'; operationId: number }
  | { type: 'operation-failed'; operationId: number }
  | { type: 'track-selected'; trackId: string }

export function createInitialLibraryUiState(): LibraryUiState {
  return {
    snapshot: null,
    selectedTrackId: null,
    operation: null,
    operationId: 0,
    hydrated: false,
    error: null,
  }
}

function findTrack(
  snapshot: LibrarySnapshot | null,
  trackId: string | null,
): LibraryTrack | null {
  if (!snapshot || !trackId) {
    return null
  }

  return snapshot.tracks.find((track) => track.id === trackId) ?? null
}

export function isTrackSelectable(
  snapshot: LibrarySnapshot | null,
  track: LibraryTrack,
): boolean {
  if (!snapshot || snapshot.access !== 'granted') {
    return false
  }

  return findTrack(snapshot, track.id)?.presence === 'present'
}

export function resolveSelectedTrack(
  state: Pick<LibraryUiState, 'selectedTrackId' | 'snapshot'>,
): LibraryTrack | null {
  const track = findTrack(state.snapshot, state.selectedTrackId)

  return track && isTrackSelectable(state.snapshot, track) ? track : null
}

function selectedTrackIdForSnapshot(
  snapshot: LibrarySnapshot,
  selectedTrackId: string | null,
): string | null {
  const track = findTrack(snapshot, selectedTrackId)

  return track && isTrackSelectable(snapshot, track) ? track.id : null
}

function isCurrentOperation(
  state: LibraryUiState,
  operationId: number,
): boolean {
  return operationId === state.operationId
}

export function libraryUiReducer(
  state: LibraryUiState,
  action: LibraryUiAction,
): LibraryUiState {
  switch (action.type) {
    case 'hydrate-started':
      if (action.operationId < state.operationId) {
        return state
      }

      return {
        ...state,
        operation: 'hydrate',
        operationId: action.operationId,
        hydrated: false,
        error: null,
      }

    case 'hydrate-committed':
      if (!isCurrentOperation(state, action.operationId)) {
        return state
      }

      return {
        ...state,
        snapshot: action.snapshot,
        selectedTrackId: action.snapshot
          ? selectedTrackIdForSnapshot(action.snapshot, state.selectedTrackId)
          : null,
        operation: null,
        hydrated: true,
        error: null,
      }

    case 'operation-started':
      if (action.operationId < state.operationId) {
        return state
      }

      return {
        ...state,
        operation: action.operation,
        operationId: action.operationId,
        error: null,
      }

    case 'snapshot-committed':
      if (!isCurrentOperation(state, action.operationId)) {
        return state
      }

      return {
        ...state,
        snapshot: action.snapshot,
        selectedTrackId: selectedTrackIdForSnapshot(
          action.snapshot,
          state.selectedTrackId,
        ),
        operation: null,
        hydrated: true,
        error: null,
      }

    case 'operation-cancelled':
      if (!isCurrentOperation(state, action.operationId)) {
        return state
      }

      return {
        ...state,
        operation: null,
        error: null,
      }

    case 'operation-failed':
      if (!isCurrentOperation(state, action.operationId)) {
        return state
      }

      return {
        ...state,
        operation: null,
        hydrated: true,
        error: state.operation,
      }

    case 'track-selected': {
      const track = findTrack(state.snapshot, action.trackId)

      if (!track || !isTrackSelectable(state.snapshot, track)) {
        return {
          ...state,
          selectedTrackId: null,
        }
      }

      return {
        ...state,
        selectedTrackId: track.id,
      }
    }
  }
}
