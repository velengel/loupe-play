import { useEffect, useMemo, useReducer, useRef, useState } from 'react'

import {
  createInitialLibraryUiState,
  isTrackSelectable,
  libraryUiReducer,
  resolveSelectedTrack,
  type LibrarySnapshot,
  type LibraryTrack,
  type LibraryUiOperation,
} from '../lib/library-ui-state'
import {
  buildListenQueue,
  findAdjacentListenTrack,
  type ListenQueueDirection,
} from '../lib/listen-queue'
import { isSelectedFilesLibrary } from '../lib/library-model'
import type { MarkerGateway } from '../lib/marker-repository'
import type { NoteGateway } from '../lib/note-repository'
import type { PlayEventRepository } from '../lib/play-event-repository'
import type { SearchGateway, SearchResult } from '../lib/search-repository'
import LibraryTree from './LibraryTree'
import ListenPlayer, {
  type ListenPlaybackRequest,
  type ListenSeekRequest,
  type PlayerMode,
} from './ListenPlayer'
import SearchPanel from './SearchPanel'

export interface LibraryWorkspaceGateway
  extends MarkerGateway,
    NoteGateway,
    PlayEventRepository,
    SearchGateway {
  loadLibrary: () => Promise<LibrarySnapshot | null>
  chooseMusicFolder: () => Promise<LibraryWorkspaceOperationResult>
  chooseMusicFiles: () => Promise<LibraryWorkspaceOperationResult>
  reconnectMusicFolder: (
    folderId: string,
  ) => Promise<LibraryWorkspaceOperationResult>
  toAudioUrl: (path: string) => string
}

export type LibraryWorkspaceOperationResult =
  | { kind: 'cancelled' }
  | { kind: 'committed'; snapshot: LibrarySnapshot }

interface LibraryWorkspaceProps {
  gateway: LibraryWorkspaceGateway
  desktopAvailable?: boolean
  onPlayerModeChange?: (mode: PlayerMode) => void
}

function statusText(
  state: ReturnType<typeof createInitialLibraryUiState>,
  desktopAvailable: boolean,
): string {
  if (!desktopAvailable) {
    return 'ブラウザでは音楽ファイルやフォルダを開けません。デスクトップ機能は npm run tauri dev で開いてください。'
  }

  if (!state.hydrated || state.operation === 'hydrate') {
    return '保存済みライブラリを読み込んでいます…'
  }

  if (state.operation === 'scan') {
    return '音楽ファイルまたはフォルダを選択し、確認しています…'
  }

  if (state.operation === 'reconnect') {
    return '保存済みの音楽フォルダへ再接続しています…'
  }

  if (!state.snapshot) {
    return '曲または音楽フォルダを選んでください。'
  }

  if (state.snapshot.access === 'permission-required') {
    return '保存済みライブラリを表示しています。再接続が必要です。'
  }

  if (state.snapshot.scan.completeness === 'partial') {
    return '一部を確認できませんでした。保存済みの曲は保持しています。'
  }

  if (state.snapshot.scan.completeness === 'complete') {
    return isSelectedFilesLibrary(state.snapshot.folder)
      ? '選択した音楽ファイルの確認が完了しました。'
      : '音楽フォルダの走査が完了しました。'
  }

  return `${state.snapshot.tracks.length}曲のライブラリを表示しています。`
}

function operationErrorText(operation: LibraryUiOperation): string {
  if (operation === 'hydrate') {
    return '保存済みライブラリを読み込めませんでした。曲または音楽フォルダを選び直してください。'
  }

  return '音楽を開けませんでした。保存済みライブラリを保持しました。'
}

function LibraryWorkspace({
  gateway,
  desktopAvailable = true,
  onPlayerModeChange,
}: LibraryWorkspaceProps) {
  const [state, dispatch] = useReducer(
    libraryUiReducer,
    undefined,
    createInitialLibraryUiState,
  )
  const [playbackRequest, setPlaybackRequest] =
    useState<ListenPlaybackRequest>({
      id: 0,
      intent: 'pause',
      focusPlayback: false,
    })
  const [seekRequest, setSeekRequest] = useState<ListenSeekRequest | null>(
    null,
  )
  const [searchEpoch, setSearchEpoch] = useState(0)
  const operationSequence = useRef(0)
  const playbackSequence = useRef(0)
  const seekSequence = useRef(0)
  const focusRootAfterCommit = useRef(false)
  const libraryRootHeadingRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    if (!desktopAvailable) {
      return
    }

    const operationId = ++operationSequence.current
    let active = true

    dispatch({ type: 'hydrate-started', operationId })

    void gateway
      .loadLibrary()
      .then((snapshot) => {
        if (active) {
          setSearchEpoch((current) => current + 1)
          dispatch({
            type: 'hydrate-committed',
            operationId,
            snapshot,
          })
        }
      })
      .catch(() => {
        if (active) {
          dispatch({ type: 'operation-failed', operationId })
        }
      })

    return () => {
      active = false
    }
  }, [desktopAvailable, gateway])

  useEffect(() => {
    if (
      focusRootAfterCommit.current &&
      state.operation === null &&
      state.snapshot?.access === 'granted'
    ) {
      focusRootAfterCommit.current = false
      libraryRootHeadingRef.current?.focus({ preventScroll: true })
    }
  }, [state.operation, state.snapshot])

  const selectedTrack = resolveSelectedTrack(state)
  const selectedAudioUrl = useMemo(
    () => (selectedTrack ? gateway.toAudioUrl(selectedTrack.path) : null),
    [gateway, selectedTrack],
  )
  const listenQueue = useMemo(
    () => buildListenQueue(state.snapshot),
    [state.snapshot],
  )
  const previousTrack = selectedTrack
    ? findAdjacentListenTrack(listenQueue, selectedTrack.id, 'previous')
    : null
  const nextTrack = selectedTrack
    ? findAdjacentListenTrack(listenQueue, selectedTrack.id, 'next')
    : null

  function requestTrack(
    track: LibraryTrack,
    intent: ListenPlaybackRequest['intent'],
    focusPlayback: boolean,
    markerPositionMs: number | null = null,
  ) {
    dispatch({ type: 'track-selected', trackId: track.id })
    setPlaybackRequest({
      id: ++playbackSequence.current,
      intent,
      focusPlayback,
    })
    setSeekRequest(
      markerPositionMs === null
        ? null
        : {
            id: ++seekSequence.current,
            trackId: track.id,
            positionMs: markerPositionMs,
          },
    )
  }

  function openSearchResult(result: SearchResult) {
    const track = state.snapshot?.tracks.find(
      (candidate) => candidate.id === result.trackId,
    )
    if (!track || !isTrackSelectable(state.snapshot, track)) return

    requestTrack(
      track,
      'pause',
      true,
      result.kind === 'marker' ? result.positionMs : null,
    )
  }

  async function runLibraryOperation(
    operation: Exclude<LibraryUiOperation, 'hydrate'>,
    request: () => Promise<LibraryWorkspaceOperationResult>,
  ) {
    const operationId = ++operationSequence.current
    const shouldFocusRootAfterCommit =
      operation === 'reconnect' || operation === 'scan'
    dispatch({ type: 'operation-started', operationId, operation })

    try {
      const result = await request()

      if (result.kind === 'cancelled') {
        dispatch({ type: 'operation-cancelled', operationId })
        return
      }

      if (
        shouldFocusRootAfterCommit &&
        operationSequence.current === operationId
      ) {
        focusRootAfterCommit.current = true
      }

      dispatch({
        type: 'snapshot-committed',
        operationId,
        snapshot: result.snapshot,
      })

      if (operationSequence.current === operationId) {
        setSearchEpoch((current) => current + 1)
        setSeekRequest(null)
        setPlaybackRequest({
          id: ++playbackSequence.current,
          intent: 'pause',
          focusPlayback: false,
        })
      }
    } catch {
      dispatch({ type: 'operation-failed', operationId })
    }
  }

  function selectTrack(track: LibraryTrack) {
    if (!isTrackSelectable(state.snapshot, track)) {
      return
    }

    requestTrack(track, 'pause', true)
  }

  function moveTrack(
    direction: ListenQueueDirection,
    continuePlayback: boolean,
  ) {
    if (!selectedTrack) {
      return
    }

    const adjacentTrack = findAdjacentListenTrack(
      listenQueue,
      selectedTrack.id,
      direction,
    )

    if (!adjacentTrack) {
      return
    }

    requestTrack(
      adjacentTrack,
      continuePlayback ? 'play' : 'pause',
      false,
    )
  }

  const busy =
    !desktopAvailable || state.operation !== null || !state.hydrated
  const reconnectSnapshot =
    state.snapshot?.access === 'permission-required'
      ? state.snapshot
      : null

  return (
    <section
      className="library-workspace"
      aria-label="音楽ライブラリ"
    >
      <div className="library-workspace-heading">
        <div>
          <p className="card-kicker">Local library</p>
          <h3>音楽ライブラリ</h3>
        </div>
        <div className="library-source-actions">
          {reconnectSnapshot ? (
            <button
              className="library-source-button library-source-button-primary"
              type="button"
              aria-label={`${reconnectSnapshot.folder.displayName} に再接続する`}
              disabled={busy}
              onClick={() =>
                void runLibraryOperation('reconnect', () =>
                  gateway.reconnectMusicFolder(reconnectSnapshot.folder.id)
                )
              }
            >
              <span className="library-source-icon" aria-hidden="true">
                ↻
              </span>
              <span className="library-source-copy">
                <strong>再接続</strong>
                <small>
                  {isSelectedFilesLibrary(reconnectSnapshot.folder)
                    ? '曲を選び直す'
                    : '同じフォルダを開く'}
                </small>
              </span>
            </button>
          ) : (
            <>
              <button
                className="library-source-button library-source-button-primary"
                type="button"
                aria-label="音楽ファイルを選ぶ"
                disabled={busy}
                onClick={() =>
                  void runLibraryOperation('scan', gateway.chooseMusicFiles)
                }
              >
                <span className="library-source-icon" aria-hidden="true">
                  ♪
                </span>
                <span className="library-source-copy">
                  <strong>曲を選ぶ</strong>
                  <small>1曲から直接開く</small>
                </span>
              </button>
              <button
                className="library-source-button"
                type="button"
                aria-label="音楽フォルダを選ぶ"
                disabled={busy}
                onClick={() =>
                  void runLibraryOperation('scan', gateway.chooseMusicFolder)
                }
              >
                <span className="library-source-icon" aria-hidden="true">
                  📁
                </span>
                <span className="library-source-copy">
                  <strong>フォルダを選ぶ</strong>
                  <small>中の曲をまとめて開く</small>
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      <p
        className="scan-status"
        role="status"
        aria-label="ライブラリの状態"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusText(state, desktopAvailable)}
      </p>

      {state.error ? (
        <p
          className="inline-error"
          role="alert"
          aria-label="ライブラリ操作エラー"
        >
          {operationErrorText(state.error)}
        </p>
      ) : null}

      {state.snapshot ? (
        <div className="library-snapshot">
          <div className="library-root-heading">
            <div>
              <h4 ref={libraryRootHeadingRef} tabIndex={-1}>
                {state.snapshot.folder.displayName}
              </h4>
              <p>
                {state.snapshot.tracks.length}曲
                {state.snapshot.scan.issues.length > 0
                  ? ` · ${state.snapshot.scan.issues.length}件を未確認`
                  : ''}
              </p>
            </div>
            {state.snapshot.access === 'permission-required' ? (
              <div className="library-replacement-actions">
                <button
                  className="library-secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runLibraryOperation('scan', gateway.chooseMusicFiles)
                  }
                >
                  別の曲を選ぶ
                </button>
                <button
                  className="library-secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runLibraryOperation(
                      'scan',
                      gateway.chooseMusicFolder,
                    )
                  }
                >
                  別の音楽フォルダを選ぶ
                </button>
              </div>
            ) : null}
          </div>

          {selectedTrack && selectedAudioUrl ? (
            <ListenPlayer
              track={selectedTrack}
              sourceUrl={selectedAudioUrl}
              playbackRequest={playbackRequest}
              hasPrevious={previousTrack !== null}
              hasNext={nextTrack !== null}
              onMove={moveTrack}
              onEnded={() => moveTrack('next', true)}
              onModeChange={onPlayerModeChange}
              markerGateway={gateway}
              historyGateway={gateway}
              noteGateway={gateway}
              seekRequest={seekRequest}
            />
          ) : null}

          {state.snapshot.access === 'granted' ? (
            <SearchPanel
              key={`${state.snapshot.folder.id}:${searchEpoch}`}
              gateway={gateway}
              onOpenResult={openSearchResult}
            />
          ) : null}

          <div
            className="library-results"
            role="group"
            aria-label="ライブラリの内容"
            aria-busy={busy}
          >
            <LibraryTree
              snapshot={state.snapshot}
              selectedTrackId={state.selectedTrackId}
              onSelectTrack={selectTrack}
            />
          </div>
        </div>
      ) : (
        <div
          className="library-results"
          role="group"
          aria-label="ライブラリの内容"
          aria-busy={busy}
        />
      )}
    </section>
  )
}

export default LibraryWorkspace
