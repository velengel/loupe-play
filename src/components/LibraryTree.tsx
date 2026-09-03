import {
  buildLibraryTree,
  type LibraryTrack as StoredLibraryTrack,
} from '../lib/library-model'
import {
  isTrackSelectable,
  type LibrarySnapshot,
  type LibraryTrack,
} from '../lib/library-ui-state'

interface LibraryTreeProps {
  snapshot: LibrarySnapshot
  selectedTrackId: string | null
  onSelectTrack: (track: LibraryTrack) => void
}

interface LibraryTreeNode {
  name: string
  relativePath: string
  folders: LibraryTreeNode[]
  tracks: LibraryTrack[]
}

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) {
    return null
  }

  const totalSeconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function trackDisplayTitle(track: LibraryTrack): string {
  const title = track.title?.trim()

  if (title) {
    return title
  }

  const extensionStart = track.fileName.lastIndexOf('.')
  return extensionStart > 0
    ? track.fileName.slice(0, extensionStart)
    : track.fileName
}

function trackActionLabel(
  snapshot: LibrarySnapshot,
  track: LibraryTrack,
  selectedTrackId: string | null,
): string {
  if (snapshot.access === 'permission-required') {
    return '再接続が必要'
  }

  if (track.presence === 'missing') {
    return '利用不可'
  }

  if (track.presence === 'unknown') {
    return '確認できません'
  }

  return selectedTrackId === track.id ? '選択中' : '選ぶ'
}

function TrackList({
  snapshot,
  tracks,
  selectedTrackId,
  onSelectTrack,
}: {
  snapshot: LibrarySnapshot
  tracks: LibraryTrack[]
  selectedTrackId: string | null
  onSelectTrack: (track: LibraryTrack) => void
}) {
  if (tracks.length === 0) {
    return null
  }

  return (
    <ul className="library-tree-tracks">
      {tracks.map((track) => {
        const displayTitle = trackDisplayTitle(track)
        const actionLabel = trackActionLabel(
          snapshot,
          track,
          selectedTrackId,
        )
        const selectable = isTrackSelectable(snapshot, track)
        const metadata = [
          track.artist,
          track.album,
          formatDuration(track.durationMs),
        ].filter((value): value is string => Boolean(value))
        const accessibleTrack = [displayTitle, ...metadata].join('、')
        const accessibleLabel =
          actionLabel === '選ぶ'
            ? `${accessibleTrack} を選ぶ`
            : `${accessibleTrack} — ${actionLabel}`
        const metadataLabel = metadata.join(' · ')

        return (
          <li key={track.id}>
            <button
              type="button"
              className="track-button library-track-button"
              aria-label={accessibleLabel}
              aria-pressed={selectedTrackId === track.id}
              disabled={!selectable}
              onClick={() => onSelectTrack(track)}
            >
              <span className="library-track-copy">
                <strong className="track-name">{displayTitle}</strong>
                {metadata.length > 0 ? (
                  <span className="library-track-meta" title={metadataLabel}>
                    {metadataLabel}
                  </span>
                ) : null}
              </span>
              <span className="library-track-action" aria-hidden="true">
                {actionLabel}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function FolderNode({
  node,
  snapshot,
  selectedTrackId,
  onSelectTrack,
  level,
}: {
  node: LibraryTreeNode
  snapshot: LibrarySnapshot
  selectedTrackId: string | null
  onSelectTrack: (track: LibraryTrack) => void
  level: number
}) {
  return (
    <li
      className="library-folder-node"
      data-indent={level >= 8 ? 'capped' : 'nested'}
    >
      <p
        className="library-folder-heading"
        role="heading"
        aria-level={level}
        title={node.name}
      >
        {node.name}
      </p>
      <TrackList
        snapshot={snapshot}
        tracks={node.tracks}
        selectedTrackId={selectedTrackId}
        onSelectTrack={onSelectTrack}
      />
      {node.folders.length > 0 ? (
        <ul className="library-tree-folders">
          {node.folders.map((folder) => (
            <FolderNode
              key={folder.relativePath}
              node={folder}
              snapshot={snapshot}
              selectedTrackId={selectedTrackId}
              onSelectTrack={onSelectTrack}
              level={level + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function LibraryTree({
  snapshot,
  selectedTrackId,
  onSelectTrack,
}: LibraryTreeProps) {
  const tree = buildLibraryTree(
    snapshot.tracks as StoredLibraryTrack[],
  ) as LibraryTreeNode

  if (snapshot.tracks.length === 0) {
    return (
      <p className="empty-result">
        保存済みの WAV、MP3、FLAC はありません。
      </p>
    )
  }

  return (
    <div
      className="library-tree"
      role="region"
      aria-label="保存済みの音源一覧"
      tabIndex={0}
    >
      <TrackList
        snapshot={snapshot}
        tracks={tree.tracks}
        selectedTrackId={selectedTrackId}
        onSelectTrack={onSelectTrack}
      />
      {tree.folders.length > 0 ? (
        <ul className="library-tree-folders library-tree-root-folders">
          {tree.folders.map((folder) => (
            <FolderNode
              key={folder.relativePath}
              node={folder}
              snapshot={snapshot}
              selectedTrackId={selectedTrackId}
              onSelectTrack={onSelectTrack}
              level={5}
            />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default LibraryTree
