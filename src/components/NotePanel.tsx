import { useEffect, useRef, useState } from 'react'

import { formatPlaybackTime } from '../lib/audio-session'
import type {
  ListeningNote,
  NoteGateway,
  NoteIdentityInput,
  TrackNote,
} from '../lib/note-repository'

interface NotePanelProps {
  trackId: string
  latestPlayEventId: string | null
  gateway: NoteGateway
  onSelectPositionMs?: (positionMs: number) => void
}

type NoteKind = 'listening' | 'track'
type AnyNote = ListeningNote | TrackNote
type NoteError = 'delete' | 'load' | 'restore' | 'save' | null

interface NoteSelection {
  kind: NoteKind
  note: AnyNote
}

interface NoteDraft {
  kind: NoteKind
  id: string
  body: string
}

interface PendingFocus {
  kind: 'edit' | 'undo'
  noteKind?: NoteKind
  noteId?: string
}

interface ListeningContext {
  accessibleLabel: string
  label: string
  positionMs: number
}

const noteDateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatNoteDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '記録日時不明'
    : noteDateFormatter.format(date)
}

function formatPosition(positionMs: number): string {
  return formatPlaybackTime(positionMs / 1_000)
}

function listeningContext(note: ListeningNote): ListeningContext {
  if (
    note.playEventLoopStartMs !== null &&
    note.playEventLoopEndMs !== null
  ) {
    const start = formatPosition(note.playEventLoopStartMs)
    const end = formatPosition(note.playEventLoopEndMs)
    return {
      accessibleLabel: `Listening Noteのループ区間 ${start}から聴く`,
      label: `ループ区間 ${start}–${end}`,
      positionMs: note.playEventLoopStartMs,
    }
  }

  const start = formatPosition(note.playEventStartPositionMs)
  const end =
    note.playEventEndPositionMs === null
      ? null
      : formatPosition(note.playEventEndPositionMs)
  return {
    accessibleLabel: `Listening Noteの再生区間 ${start}から聴く`,
    label: end === null ? `再生区間 ${start}から` : `再生区間 ${start}–${end}`,
    positionMs: note.playEventStartPositionMs,
  }
}

function compareNotes(left: AnyNote, right: AnyNote): number {
  return (
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  )
}

function upsertNote<T extends AnyNote>(notes: T[], note: T): T[] {
  return [...notes.filter((candidate) => candidate.id !== note.id), note].sort(
    compareNotes,
  )
}

function kindLabel(kind: NoteKind): string {
  return kind === 'track' ? 'Track Note' : 'Listening Note'
}

function NotePanel({
  trackId,
  latestPlayEventId,
  gateway,
  onSelectPositionMs,
}: NotePanelProps) {
  const [trackNotes, setTrackNotes] = useState<TrackNote[]>([])
  const [listeningNotes, setListeningNotes] = useState<ListeningNote[]>([])
  const [trackBody, setTrackBody] = useState('')
  const [listeningBody, setListeningBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<NoteError>(null)
  const [errorKind, setErrorKind] = useState<NoteKind>('track')
  const [draft, setDraft] = useState<NoteDraft | null>(null)
  const [confirming, setConfirming] = useState<NoteSelection | null>(null)
  const [deleted, setDeleted] = useState<NoteSelection | null>(null)
  const generationRef = useRef(0)
  const activeRef = useRef(false)
  const busyRef = useRef(false)
  const editBodyRef = useRef<HTMLTextAreaElement | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const undoButtonRef = useRef<HTMLButtonElement | null>(null)
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocusRef = useRef<PendingFocus | null>(null)

  useEffect(() => {
    const generation = ++generationRef.current
    activeRef.current = true

    void Promise.all([
      gateway.loadTrackNotes(trackId),
      gateway.loadListeningNotes(trackId),
    ]).then(
      ([loadedTrackNotes, loadedListeningNotes]) => {
        if (
          !activeRef.current ||
          generationRef.current !== generation
        ) {
          return
        }
        setTrackNotes([...loadedTrackNotes].sort(compareNotes))
        setListeningNotes([...loadedListeningNotes].sort(compareNotes))
        setLoading(false)
        setError(null)
      },
      () => {
        if (
          !activeRef.current ||
          generationRef.current !== generation
        ) {
          return
        }
        setLoading(false)
        setError('load')
      },
    )

    return () => {
      if (generationRef.current === generation) {
        activeRef.current = false
        generationRef.current += 1
      }
    }
  }, [gateway, trackId])

  useEffect(() => {
    if (draft) {
      editBodyRef.current?.focus({ preventScroll: true })
    }
  }, [draft])

  useEffect(() => {
    if (confirming) {
      confirmButtonRef.current?.focus({ preventScroll: true })
    }
  }, [confirming])

  useEffect(() => {
    const pending = pendingFocusRef.current
    if (!pending) return
    const target =
      pending.kind === 'undo'
        ? undoButtonRef.current
        : pending.noteKind && pending.noteId
          ? editButtonRefs.current.get(`${pending.noteKind}:${pending.noteId}`)
          : null
    if (target) {
      pendingFocusRef.current = null
      target.focus({ preventScroll: true })
    }
  }, [deleted, draft, listeningNotes, trackNotes])

  function beginMutation(kind: NoteKind): number | null {
    if (busyRef.current || loading || error === 'load') return null
    busyRef.current = true
    setBusy(true)
    setError(null)
    setErrorKind(kind)
    return generationRef.current
  }

  function isCurrent(generation: number): boolean {
    return activeRef.current && generationRef.current === generation
  }

  function finishMutation(generation: number) {
    if (!isCurrent(generation)) return
    busyRef.current = false
    setBusy(false)
  }

  async function createNote(kind: NoteKind) {
    const body = kind === 'track' ? trackBody : listeningBody
    if (body.trim().length === 0) return
    const generation = beginMutation(kind)
    if (generation === null) return

    try {
      if (kind === 'track') {
        const created = await gateway.createTrackNote({ trackId, body })
        if (!isCurrent(generation)) return
        setTrackNotes((current) => upsertNote(current, created))
        setTrackBody('')
      } else {
        if (!latestPlayEventId) return
        const created = await gateway.createListeningNote({
          playEventId: latestPlayEventId,
          trackId,
          body,
        })
        if (!isCurrent(generation)) return
        setListeningNotes((current) => upsertNote(current, created))
        setListeningBody('')
      }
    } catch {
      if (isCurrent(generation)) setError('save')
    } finally {
      finishMutation(generation)
    }
  }

  async function saveDraft() {
    if (!draft || draft.body.trim().length === 0) return
    const generation = beginMutation(draft.kind)
    if (generation === null) return
    const identity = { id: draft.id, trackId, body: draft.body }

    try {
      if (draft.kind === 'track') {
        const updated = await gateway.updateTrackNote(identity)
        if (!isCurrent(generation)) return
        setTrackNotes((current) => upsertNote(current, updated))
      } else {
        const updated = await gateway.updateListeningNote(identity)
        if (!isCurrent(generation)) return
        setListeningNotes((current) => upsertNote(current, updated))
      }
      pendingFocusRef.current = {
        kind: 'edit',
        noteKind: draft.kind,
        noteId: draft.id,
      }
      setDraft(null)
    } catch {
      if (isCurrent(generation)) setError('save')
    } finally {
      finishMutation(generation)
    }
  }

  async function deleteNote(selection: NoteSelection) {
    const generation = beginMutation(selection.kind)
    if (generation === null) return
    const input: NoteIdentityInput = { id: selection.note.id, trackId }

    try {
      if (selection.kind === 'track') {
        await gateway.deleteTrackNote(input)
      } else {
        await gateway.deleteListeningNote(input)
      }
      if (!isCurrent(generation)) return
      if (selection.kind === 'track') {
        setTrackNotes((current) =>
          current.filter((note) => note.id !== selection.note.id),
        )
      } else {
        setListeningNotes((current) =>
          current.filter((note) => note.id !== selection.note.id),
        )
      }
      setConfirming(null)
      setDeleted(selection)
      pendingFocusRef.current = { kind: 'undo' }
    } catch {
      if (isCurrent(generation)) {
        setConfirming(null)
        setError('delete')
      }
    } finally {
      finishMutation(generation)
    }
  }

  async function restoreNote() {
    if (!deleted) return
    const generation = beginMutation(deleted.kind)
    if (generation === null) return
    const input: NoteIdentityInput = { id: deleted.note.id, trackId }

    try {
      if (deleted.kind === 'track') {
        const restored = await gateway.restoreTrackNote(input)
        if (!isCurrent(generation)) return
        setTrackNotes((current) => upsertNote(current, restored))
      } else {
        const restored = await gateway.restoreListeningNote(input)
        if (!isCurrent(generation)) return
        setListeningNotes((current) => upsertNote(current, restored))
      }
      pendingFocusRef.current = {
        kind: 'edit',
        noteKind: deleted.kind,
        noteId: deleted.note.id,
      }
      setDeleted(null)
    } catch {
      if (isCurrent(generation)) setError('restore')
    } finally {
      finishMutation(generation)
    }
  }

  function renderSection(kind: NoteKind, notes: AnyNote[]) {
    const label = kindLabel(kind)
    const body = kind === 'track' ? trackBody : listeningBody
    const setBody = kind === 'track' ? setTrackBody : setListeningBody
    const listeningUnavailable = kind === 'listening' && !latestPlayEventId

    return (
      <section className="note-section" aria-labelledby={`${kind}-note-title`}>
        <h6 id={`${kind}-note-title`}>{label}</h6>
        <label>
          <span>{label}本文</span>
          <textarea
            aria-label={`${label}本文`}
            value={body}
            disabled={busy || loading || error === 'load' || listeningUnavailable}
            onChange={(event) => setBody(event.currentTarget.value)}
          />
        </label>
        {listeningUnavailable ? <p>この曲を再生すると書けます。</p> : null}
        <button
          type="button"
          disabled={
            busy ||
            loading ||
            error === 'load' ||
            listeningUnavailable ||
            body.trim().length === 0
          }
          onClick={() => void createNote(kind)}
        >
          {label}を追加
        </button>

        {notes.length === 0 && !loading && error !== 'load' ? (
          <p>{label}はまだありません。</p>
        ) : null}
        {notes.length > 0 ? (
          <ul className="note-list">
            {notes.map((note) => {
              const editing = draft?.kind === kind && draft.id === note.id
              const confirmingThis =
                confirming?.kind === kind && confirming.note.id === note.id
              const key = `${kind}:${note.id}`
              const context =
                kind === 'listening'
                  ? listeningContext(note as ListeningNote)
                  : null
              return (
                <li key={note.id}>
                  {editing && draft ? (
                    <div className="note-edit-controls">
                      <label>
                        <span>編集する{label}本文</span>
                        <textarea
                          ref={editBodyRef}
                          aria-label={`編集する${label}本文`}
                          value={draft.body}
                          disabled={busy}
                          onChange={(event) =>
                            setDraft({ ...draft, body: event.currentTarget.value })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy || draft.body.trim().length === 0}
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
                            noteKind: kind,
                            noteId: note.id,
                          }
                          setDraft(null)
                        }}
                      >
                        編集をやめる
                      </button>
                    </div>
                  ) : (
                    <p className="note-body">{note.body}</p>
                  )}
                  <div className="note-meta">
                    {context ? (
                      <span className="note-context">
                        {onSelectPositionMs ? (
                          <button
                            className="note-context-button"
                            type="button"
                            aria-label={context.accessibleLabel}
                            onClick={() =>
                              onSelectPositionMs(context.positionMs)
                            }
                          >
                            <span aria-hidden="true">▶ </span>
                            {context.label}
                          </button>
                        ) : (
                          <span className="note-context-label">
                            {context.label}
                          </span>
                        )}
                      </span>
                    ) : null}
                    <time dateTime={note.createdAt}>
                      記録 {formatNoteDate(note.createdAt)}
                    </time>
                  </div>
                  {editing ? null : confirmingThis ? (
                    <div
                      className="note-delete-confirmation"
                      role="group"
                      aria-label={`${label}削除確認`}
                    >
                      <p>{note.body} を削除しますか？</p>
                      <button
                        ref={confirmButtonRef}
                        type="button"
                        disabled={busy}
                        onClick={() => void deleteNote({ kind, note })}
                      >
                        この{label}を削除する
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirming(null)}
                      >
                        削除をやめる
                      </button>
                    </div>
                  ) : (
                    <div className="note-item-actions">
                      <button
                        ref={(element) => {
                          if (element) editButtonRefs.current.set(key, element)
                          else editButtonRefs.current.delete(key)
                        }}
                        type="button"
                        disabled={busy}
                        aria-label={`${label}「${note.body}」を編集`}
                        onClick={() => {
                          setConfirming(null)
                          setDraft({ kind, id: note.id, body: note.body })
                        }}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`${label}「${note.body}」を削除`}
                        onClick={() => {
                          setDraft(null)
                          setConfirming({ kind, note })
                        }}
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
      </section>
    )
  }

  const errorLabel = kindLabel(errorKind)

  return (
    <details className="note-panel">
      <summary>メモ</summary>
      <div className="note-panel-content" aria-busy={loading || busy}>
        {loading ? <p>メモを読み込んでいます…</p> : null}
        {error === 'load' ? (
          <p className="inline-error" role="alert" aria-label="メモ読込エラー">
            メモを読み込めませんでした。曲を開き直してください。
          </p>
        ) : null}
        {error === 'save' ? (
          <p
            className="inline-error"
            role="alert"
            aria-label={`${errorLabel}保存エラー`}
          >
            {errorLabel}を保存できませんでした。入力は保持しています。
          </p>
        ) : null}
        {error === 'delete' ? (
          <p className="inline-error" role="alert" aria-label="メモ削除エラー">
            メモを削除できませんでした。一覧に残しています。
          </p>
        ) : null}
        {error === 'restore' ? (
          <p className="inline-error" role="alert" aria-label="メモ復元エラー">
            メモを復元できませんでした。もう一度試してください。
          </p>
        ) : null}
        {deleted ? (
          <div className="note-undo" role="status" aria-label="メモを削除しました">
            <span>{kindLabel(deleted.kind)}を削除しました。</span>
            <button
              ref={undoButtonRef}
              type="button"
              disabled={busy}
              onClick={() => void restoreNote()}
            >
              元に戻す
            </button>
          </div>
        ) : null}
        {renderSection('track', trackNotes)}
        {renderSection('listening', listeningNotes)}
      </div>
    </details>
  )
}

export default NotePanel
