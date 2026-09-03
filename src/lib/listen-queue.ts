import {
  buildLibraryTree,
  type LibraryFolderTree,
  type LibraryTrack as StoredLibraryTrack,
} from './library-model'
import type {
  LibrarySnapshot,
  LibraryTrack,
} from './library-ui-state'

export type ListenQueueDirection = 'previous' | 'next'

function appendVisibleTracks(
  node: LibraryFolderTree,
  queue: StoredLibraryTrack[],
): void {
  queue.push(...node.tracks)

  for (const folder of node.folders) {
    appendVisibleTracks(folder, queue)
  }
}

export function buildListenQueue(
  snapshot: LibrarySnapshot | null,
): LibraryTrack[] {
  if (!snapshot || snapshot.access !== 'granted') {
    return []
  }

  const tree = buildLibraryTree(
    snapshot.tracks.filter(
      (track) => track.presence === 'present',
    ) as StoredLibraryTrack[],
  )
  const queue: StoredLibraryTrack[] = []
  appendVisibleTracks(tree, queue)

  return queue as LibraryTrack[]
}

export function findAdjacentListenTrack(
  queue: LibraryTrack[],
  currentTrackId: string,
  direction: ListenQueueDirection,
): LibraryTrack | null {
  const currentIndex = queue.findIndex((track) => track.id === currentTrackId)

  if (currentIndex < 0) {
    return null
  }

  const targetIndex =
    direction === 'previous' ? currentIndex - 1 : currentIndex + 1

  return queue[targetIndex] ?? null
}
