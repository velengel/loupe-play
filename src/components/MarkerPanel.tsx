import { useEffect, useRef, useState } from 'react'

import type {
  CreateMarkerInput,
  Marker,
  MarkerIdentityInput,
  MarkerRepository,
  UpdateMarkerInput,
} from '../lib/marker-repository'

export interface MarkerPanelProps {
  trackId: string
  gateway: MarkerRepository
  getCurrentPositionSeconds: () => number
  onSelectPositionMs: (positionMs: number) => void
  mediaReady?: boolean
  maximumPositionSeconds?: number
}

type MarkerError = 'delete' | 'load' | 'restore' | 'save' | null

interface MarkerDraft {
  id: string
  label: string
  body: string
  positionMs: number
}

function formatMarkerPosition(positionMs: number): string {
  const wholeSeconds = Math.floor(positionMs / 1_000)
  const minutes = Math.floor(wholeSeconds / 60)
  const seconds = wholeSeconds % 60
  const hundredths = Math.floor((positionMs % 1_000) / 10)

  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(
    hundredths,
  ).padStart(2, '0')}`
}

function compareMarkers(left: Marker, right: Marker): number {
  return (
    left.positionMs - right.positionMs ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  )
}

function sortedMarkers(markers: Marker[]): Marker[] {
  return [...markers].sort(compareMarkers)
}

function upsertMarker(markers: Marker[], marker: Marker): Marker[] {
  return sortedMarkers([
    ...markers.filter((candidate) => candidate.id !== marker.id),
    marker,
  ])
}

interface MarkerMutationChannel {
  listeners: Map<symbol, () => void>
  pending: Set<Promise<void>>
}

const markerMutationChannels = new WeakMap<
  MarkerRepository,
  Map<string, MarkerMutationChannel>
>()

function markerMutationChannel(
  gateway: MarkerRepository,
  trackId: string,
): MarkerMutationChannel {
  let gatewayChannels = markerMutationChannels.get(gateway)

  if (!gatewayChannels) {
    gatewayChannels = new Map()
    markerMutationChannels.set(gateway, gatewayChannels)
  }

  let channel = gatewayChannels.get(trackId)

  if (!channel) {
    channel = { listeners: new Map(), pending: new Set() }
    gatewayChannels.set(trackId, channel)
  }

  return channel
}

function releaseMarkerMutationChannel(
  gateway: MarkerRepository,
  trackId: string,
  channel: MarkerMutationChannel,
) {
  if (channel.listeners.size > 0 || channel.pending.size > 0) {
    return
  }

  const gatewayChannels = markerMutationChannels.get(gateway)
  if (gatewayChannels?.get(trackId) === channel) {
    gatewayChannels.delete(trackId)
  }
  if (gatewayChannels?.size === 0) {
    markerMutationChannels.delete(gateway)
  }
}

function subscribeToMarkerMutations(
  gateway: MarkerRepository,
  trackId: string,
  source: symbol,
  listener: () => void,
): () => void {
  const channel = markerMutationChannel(gateway, trackId)
  channel.listeners.set(source, listener)

  return () => {
    channel.listeners.delete(source)
    releaseMarkerMutationChannel(gateway, trackId, channel)
  }
}

function runMarkerMutation<T>(
  gateway: MarkerRepository,
  trackId: string,
  mutation: () => Promise<T>,
): Promise<T> {
  const channel = markerMutationChannel(gateway, trackId)
  const result = Promise.resolve().then(mutation)
  const settled = result.then(
    () => undefined,
    () => undefined,
  )
  channel.pending.add(settled)

  void settled.then(() => {
    channel.pending.delete(settled)
    for (const listener of channel.listeners.values()) {
      listener()
    }
    releaseMarkerMutationChannel(gateway, trackId, channel)
  })

  return result
}

function TrackMarkerPanel({
  trackId,
  gateway,
  getCurrentPositionSeconds,
  onSelectPositionMs,
  mediaReady = true,
  maximumPositionSeconds,
}: MarkerPanelProps) {
  const [markers, setMarkers] = useState<Marker[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MarkerError>(null)
  const [label, setLabel] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState<MarkerDraft | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<
    string | null
  >(null)
  const [deletedMarker, setDeletedMarker] = useState<Marker | null>(null)
  const generationRef = useRef(0)
  const activeRef = useRef(false)
  const busyRef = useRef(false)
  const confirmDeleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const mutationSourceRef = useRef(Symbol('MarkerPanel'))
  const editNameInputRef = useRef<HTMLInputElement | null>(null)
  const undoButtonRef = useRef<HTMLButtonElement | null>(null)
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const deleteButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const positionButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocusRef = useRef<
    | { kind: 'delete' | 'edit' | 'position'; markerId: string }
    | { kind: 'undo' }
    | null
  >(null)
  const editingMarkerId = draft?.id ?? null

  useEffect(() => {
    const generation = ++generationRef.current
    let loadSequence = 0
    activeRef.current = true

    const loadMarkers = async () => {
      const requestSequence = ++loadSequence

      try {
        const loadedMarkers = await gateway.loadMarkers(trackId)
        if (
          !activeRef.current ||
          generationRef.current !== generation ||
          requestSequence !== loadSequence
        ) {
          return
        }

        setMarkers(sortedMarkers(loadedMarkers))
        setLoading(false)
        setError((current) => (current === 'load' ? null : current))
      } catch {
        if (
          !activeRef.current ||
          generationRef.current !== generation ||
          requestSequence !== loadSequence
        ) {
          return
        }

        setLoading(false)
        setError('load')
      }
    }

    const unsubscribe = subscribeToMarkerMutations(
      gateway,
      trackId,
      mutationSourceRef.current,
      () => void loadMarkers(),
    )
    void loadMarkers()

    return () => {
      unsubscribe()
      if (generationRef.current === generation) {
        activeRef.current = false
        generationRef.current += 1
      }
    }
  }, [gateway, trackId])

  useEffect(() => {
    if (confirmingDeleteId) {
      confirmDeleteButtonRef.current?.focus({ preventScroll: true })
    }
  }, [confirmingDeleteId])

  useEffect(() => {
    if (editingMarkerId) {
      editNameInputRef.current?.focus({ preventScroll: true })
    }
  }, [editingMarkerId])

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current

    if (!pendingFocus) {
      return
    }

    const target =
      pendingFocus.kind === 'undo'
        ? undoButtonRef.current
        : pendingFocus.kind === 'edit'
          ? editButtonRefs.current.get(pendingFocus.markerId)
          : pendingFocus.kind === 'delete'
            ? deleteButtonRefs.current.get(pendingFocus.markerId)
            : positionButtonRefs.current.get(pendingFocus.markerId)

    if (target) {
      pendingFocusRef.current = null
      target.focus({ preventScroll: true })
    }
  }, [confirmingDeleteId, deletedMarker, draft, markers])

  function isCurrentOperation(
    operationGeneration: number,
    operationTrackId: string,
  ): boolean {
    return (
      activeRef.current &&
      generationRef.current === operationGeneration &&
      trackId === operationTrackId
    )
  }

  function beginMutation(): {
    generation: number
    trackId: string
  } | null {
    if (busyRef.current || loading) {
      return null
    }

    busyRef.current = true
    setBusy(true)
    setError(null)
    return { generation: generationRef.current, trackId }
  }

  function finishMutation(
    operationGeneration: number,
    operationTrackId: string,
  ) {
    if (!isCurrentOperation(operationGeneration, operationTrackId)) {
      return
    }

    busyRef.current = false
    setBusy(false)
  }

  function currentPositionMs(): number | null {
    if (!mediaReady) {
      return null
    }

    try {
      const seconds = getCurrentPositionSeconds()

      if (!Number.isFinite(seconds)) {
        return null
      }

      const maximum =
        typeof maximumPositionSeconds === 'number' &&
        Number.isFinite(maximumPositionSeconds) &&
        maximumPositionSeconds >= 0
          ? maximumPositionSeconds
          : Number.POSITIVE_INFINITY
      return Math.max(0, Math.round(Math.min(seconds, maximum) * 1_000))
    } catch {
      return null
    }
  }

  async function createMarker() {
    const operation = beginMutation()

    if (!operation) {
      return
    }

    const positionMs = currentPositionMs()

    if (positionMs === null) {
      setError('save')
      finishMutation(operation.generation, operation.trackId)
      return
    }

    const input: CreateMarkerInput = {
      trackId: operation.trackId,
      positionMs,
      label,
      body,
    }

    try {
      const created = await runMarkerMutation(
        gateway,
        operation.trackId,
        () => gateway.createMarker(input),
      )

      if (!isCurrentOperation(operation.generation, operation.trackId)) {
        return
      }

      setMarkers((current) => upsertMarker(current, created))
      setLabel('')
      setBody('')
    } catch {
      if (!isCurrentOperation(operation.generation, operation.trackId)) {
        return
      }

      setError('save')
    } finally {
      finishMutation(operation.generation, operation.trackId)
    }
  }

  function beginEdit(marker: Marker) {
    if (busyRef.current) {
      return
    }

    setError(null)
    setConfirmingDeleteId(null)
    setDraft({
      id: marker.id,
      label: marker.label ?? '',
      body: marker.body ?? '',
      positionMs: marker.positionMs,
    })
  }

  function adoptCurrentPosition() {
    const positionMs = currentPositionMs()

    if (positionMs === null) {
      setError('save')
      return
    }

    setDraft((current) =>
      current ? { ...current, positionMs } : current,
    )
  }

  async function saveDraft() {
    if (!draft) {
      return
    }

    const operation = beginMutation()

    if (!operation) {
      return
    }

    const input: UpdateMarkerInput = {
      id: draft.id,
      trackId: operation.trackId,
      positionMs: draft.positionMs,
      label: draft.label,
      body: draft.body,
    }

    try {
      const updated = await runMarkerMutation(
        gateway,
        operation.trackId,
        () => gateway.updateMarker(input),
      )

      if (!isCurrentOperation(operation.generation, operation.trackId)) {
        return
      }

      setMarkers((current) => upsertMarker(current, updated))
      pendingFocusRef.current = { kind: 'edit', markerId: updated.id }
      setDraft(null)
    } catch {
      if (!isCurrentOperation(operation.generation, operation.trackId)) {
        return
      }

      setError('save')
    } finally {
      finishMutation(operation.generation, operation.trackId)
    }
  }

  function requestDelete(marker: Marker) {
    if (busyRef.current) {
      return
    }

    setError(null)
    setDraft(null)
    setConfirmingDeleteId(marker.id)
  }

  async function confirmDelete(marker: Marker) {
    const operation = beginMutation()

    if (!operation) {
      return
    }

    const input: MarkerIdentityInput = {
      id: marker.id,
      trackId: operation.trackId,
    }

    try {
      await runMarkerMutation(
        gateway,
        operation.trackId,
        () => gateway.deleteMarker(input),
      )

      if (!isCurrentOperation(operation.generation, operation.trackId)) {
        return
      }

      setMarkers((current) =>
        current.filter((candidate) => candidate.id !== marker.id),
      )
      pendingFocusRef.current = { kind: 'undo' }
      setDeletedMarker(marker)
      setConfirmingDeleteId(null)
    } catch {
      if (!isCurrentOperation(operation.generation, operation.trackId)) {
        return
      }

      setConfirmingDeleteId(null)
      pendingFocusRef.current = {
        kind: 'delete',
        markerId: marker.id,
      }
      setError('delete')
    } finally {
      finishMutation(operation.generation, operation.trackId)
    }
  }

  async function restoreDeletedMarker() {
    if (!deletedMarker) {
      return
    }

    const operation = beginMutation()

    if (!operation) {
      return
    }

    const restoringMarker = deletedMarker
    const input: MarkerIdentityInput = {
      id: restoringMarker.id,
      trackId: operation.trackId,
    }

    try {
      const restored = await runMarkerMutation(
        gateway,
        operation.trackId,
        () => gateway.restoreMarker(input),
      )

      if (!isCurrentOperation(operation.generation, operation.trackId)) {
        return
      }

      setMarkers((current) => upsertMarker(current, restored))
      pendingFocusRef.current = {
        kind: mediaReady ? 'position' : 'edit',
        markerId: restoringMarker.id,
      }
      setDeletedMarker(null)
    } catch {
      if (!isCurrentOperation(operation.generation, operation.trackId)) {
        return
      }

      setError('restore')
    } finally {
      finishMutation(operation.generation, operation.trackId)
    }
  }

  return (
    <section className="marker-panel" aria-busy={loading || busy}>
      <h6>Marker</h6>

      <div className="marker-create-controls">
        <label>
          <span>Markerの名前（任意）</span>
          <input
            type="text"
            aria-label="Markerの名前（任意）"
            value={label}
            disabled={busy}
            onChange={(event) => setLabel(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Markerのメモ（任意）</span>
          <textarea
            aria-label="Markerのメモ（任意）"
            value={body}
            disabled={busy}
            onChange={(event) => setBody(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          disabled={
            loading || busy || error === 'load' || !mediaReady
          }
          onClick={() => void createMarker()}
        >
          現在位置へMarkerを作成
        </button>
      </div>

      {error === 'load' ? (
        <p className="inline-error" role="alert" aria-label="Marker読込エラー">
          Markerを読み込めませんでした。Practiceを開き直してください。
        </p>
      ) : null}
      {error === 'save' ? (
        <p className="inline-error" role="alert" aria-label="Marker保存エラー">
          Markerを保存できませんでした。入力内容と現在の音声は保持しています。
        </p>
      ) : null}
      {error === 'delete' ? (
        <p className="inline-error" role="alert" aria-label="Marker削除エラー">
          Markerを削除できませんでした。Markerは一覧に残しています。
        </p>
      ) : null}
      {error === 'restore' ? (
        <p className="inline-error" role="alert" aria-label="Marker復元エラー">
          Markerを復元できませんでした。もう一度試してください。
        </p>
      ) : null}

      {deletedMarker ? (
        <div
          className="marker-undo"
          role="status"
          aria-label="Markerを削除しました"
        >
          <span>
            {formatMarkerPosition(deletedMarker.positionMs)} を削除しました。
          </span>
          <button
            ref={undoButtonRef}
            type="button"
            disabled={busy}
            onClick={() => void restoreDeletedMarker()}
          >
            元に戻す
          </button>
        </div>
      ) : null}

      <div className="marker-list" role="region" aria-label="Marker一覧">
        {loading ? <p>Markerを読み込んでいます…</p> : null}
        {!loading && error !== 'load' && markers.length === 0 ? (
          <p>Markerはまだありません。</p>
        ) : null}
        {markers.length > 0 ? (
          <ul>
            {markers.map((marker) => {
              const position = formatMarkerPosition(marker.positionMs)
              const editing = draft?.id === marker.id
              const confirming = confirmingDeleteId === marker.id
              const samePositionMarkers = markers.filter(
                (candidate) => candidate.positionMs === marker.positionMs,
              )
              const samePositionIndex = samePositionMarkers.findIndex(
                (candidate) => candidate.id === marker.id,
              )
              const disambiguator =
                samePositionMarkers.length > 1
                  ? ` ${marker.label ?? '無題のマーカー'}（同時刻${samePositionIndex + 1}件目）`
                  : ''
              const moveName = disambiguator
                ? `${position}${disambiguator}のMarkerへ移動`
                : `${position}へ移動`
              const editName = `${position}${disambiguator}のMarkerを編集`
              const deleteName = `${position}${disambiguator}のMarkerを削除`

              return (
                <li key={marker.id}>
                  <button
                    ref={(element) => {
                      if (element) {
                        positionButtonRefs.current.set(marker.id, element)
                      } else {
                        positionButtonRefs.current.delete(marker.id)
                      }
                    }}
                    type="button"
                    aria-label={moveName}
                    disabled={!mediaReady}
                    onClick={() => onSelectPositionMs(marker.positionMs)}
                  >
                    {position}
                  </button>

                  {editing && draft ? (
                    <div className="marker-edit-controls">
                      <label>
                        <span>編集するMarkerの名前（任意）</span>
                        <input
                          ref={editNameInputRef}
                          type="text"
                          aria-label="編集するMarkerの名前（任意）"
                          value={draft.label}
                          disabled={busy}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              label: event.currentTarget.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>編集するMarkerのメモ（任意）</span>
                        <textarea
                          aria-label="編集するMarkerのメモ（任意）"
                          value={draft.body}
                          disabled={busy}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              body: event.currentTarget.value,
                            })
                          }
                        />
                      </label>
                      <p>保存位置 {formatMarkerPosition(draft.positionMs)}</p>
                      <button
                        type="button"
                        disabled={busy || !mediaReady}
                        onClick={adoptCurrentPosition}
                      >
                        現在位置を使う
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveDraft()}
                      >
                        変更を保存
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          pendingFocusRef.current = {
                            kind: 'edit',
                            markerId: marker.id,
                          }
                          setDraft(null)
                        }}
                      >
                        編集をやめる
                      </button>
                    </div>
                  ) : (
                    <div className="marker-content">
                      <p>{marker.label ?? '無題のマーカー'}</p>
                      {marker.body ? <p>{marker.body}</p> : null}
                    </div>
                  )}

                  {editing ? null : confirming ? (
                    <div
                      className="marker-delete-confirmation"
                      role="group"
                      aria-label={`${position}のMarker削除確認`}
                    >
                      <p>
                        {marker.label ?? '無題のマーカー'} を削除しますか？
                      </p>
                      <button
                        ref={confirmDeleteButtonRef}
                        type="button"
                        disabled={busy}
                        onClick={() => void confirmDelete(marker)}
                      >
                        このMarkerを削除する
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          pendingFocusRef.current = {
                            kind: 'delete',
                            markerId: marker.id,
                          }
                          setConfirmingDeleteId(null)
                        }}
                      >
                        削除をやめる
                      </button>
                    </div>
                  ) : (
                    <div className="marker-item-actions">
                      <button
                        ref={(element) => {
                          if (element) {
                            editButtonRefs.current.set(marker.id, element)
                          } else {
                            editButtonRefs.current.delete(marker.id)
                          }
                        }}
                        type="button"
                        disabled={busy}
                        aria-label={editName}
                        onClick={() => beginEdit(marker)}
                      >
                        編集
                      </button>
                      <button
                        ref={(element) => {
                          if (element) {
                            deleteButtonRefs.current.set(marker.id, element)
                          } else {
                            deleteButtonRefs.current.delete(marker.id)
                          }
                        }}
                        type="button"
                        disabled={busy}
                        aria-label={deleteName}
                        onClick={() => requestDelete(marker)}
                      >
                        削除
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </section>
  )
}

function MarkerPanel(props: MarkerPanelProps) {
  return <TrackMarkerPanel key={props.trackId} {...props} />
}

export default MarkerPanel
