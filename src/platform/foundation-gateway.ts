import type {
  LibraryOperationResult,
  LibrarySnapshot,
} from '../lib/library-model'
import type { MarkerGateway } from '../lib/marker-repository'
import type { NoteGateway } from '../lib/note-repository'
import type { PlayEventRepository } from '../lib/play-event-repository'
import type { SearchGateway } from '../lib/search-repository'

export interface FoundationGateway
  extends MarkerGateway,
    NoteGateway,
    PlayEventRepository,
    SearchGateway {
  runtime: 'desktop' | 'browser'
  checkDatabase: () => Promise<void>
  loadLibrary: () => Promise<LibrarySnapshot | null>
  chooseMusicFolder: () => Promise<LibraryOperationResult>
  chooseMusicFiles: () => Promise<LibraryOperationResult>
  reconnectMusicFolder: (folderId: string) => Promise<LibraryOperationResult>
  toAudioUrl: (path: string) => string
}

const markerUnavailable = async (): Promise<never> => {
  throw new Error('Tauri desktop runtime is not available')
}

export const unavailableFoundationGateway: FoundationGateway = {
  runtime: 'browser',
  checkDatabase: async () => {
    throw new Error('Tauri desktop runtime is not available')
  },
  loadLibrary: async () => null,
  chooseMusicFolder: async () => {
    throw new Error('Tauri desktop runtime is not available')
  },
  chooseMusicFiles: async () => {
    throw new Error('Tauri desktop runtime is not available')
  },
  reconnectMusicFolder: async () => {
    throw new Error('Tauri desktop runtime is not available')
  },
  toAudioUrl: () => '',
  loadMarkers: markerUnavailable,
  createMarker: markerUnavailable,
  updateMarker: markerUnavailable,
  deleteMarker: markerUnavailable,
  restoreMarker: markerUnavailable,
  loadTrackNotes: markerUnavailable,
  loadListeningNotes: markerUnavailable,
  createTrackNote: markerUnavailable,
  createListeningNote: markerUnavailable,
  updateTrackNote: markerUnavailable,
  updateListeningNote: markerUnavailable,
  deleteTrackNote: markerUnavailable,
  deleteListeningNote: markerUnavailable,
  restoreTrackNote: markerUnavailable,
  restoreListeningNote: markerUnavailable,
  loadPlayEvents: markerUnavailable,
  startPlayEvent: markerUnavailable,
  closePlayEvent: markerUnavailable,
  searchNotes: markerUnavailable,
}
