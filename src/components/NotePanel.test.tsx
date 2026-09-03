import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type {
  ListeningNote,
  NoteGateway,
  TrackNote,
} from '../lib/note-repository'
import NotePanel from './NotePanel'

type Story0012ListeningNote = ListeningNote & {
  playEventStartPositionMs: number
  playEventEndPositionMs: number | null
  playEventLoopStartMs: number | null
  playEventLoopEndMs: number | null
}

type Story0012NotePanelProps = React.ComponentProps<typeof NotePanel> & {
  onSelectPositionMs: (positionMs: number) => void
}

const Story0012NotePanel =
  NotePanel as React.ComponentType<Story0012NotePanelProps>

function trackNote(overrides: Partial<TrackNote> = {}): TrackNote {
  return {
    id: 'track-note-1',
    trackId: 'track-1',
    body: '曲全体のベースを聴く',
    createdAt: '2026-09-02T11:00:00.000Z',
    updatedAt: '2026-09-02T11:00:00.000Z',
    ...overrides,
  }
}

function listeningNote(
  overrides: Partial<Story0012ListeningNote> = {},
): Story0012ListeningNote {
  return {
    ...trackNote(),
    id: 'listening-note-1',
    playEventId: 'event-1',
    body: '今日はAメロがよかった',
    playEventStartedAt: '2026-09-02T10:00:00.000Z',
    playEventStartPositionMs: 12_000,
    playEventEndPositionMs: 48_000,
    playEventLoopStartMs: null,
    playEventLoopEndMs: null,
    ...overrides,
  } as Story0012ListeningNote
}

function createGateway(
  initialTrackNotes: TrackNote[] = [],
  initialListeningNotes: ListeningNote[] = [],
): NoteGateway {
  let trackNotes = [...initialTrackNotes]
  let listeningNotes = [...initialListeningNotes]
  const deletedTrackNotes = new Map<string, TrackNote>()
  const deletedListeningNotes = new Map<string, ListeningNote>()

  return {
    loadTrackNotes: vi.fn(async (trackId) =>
      trackNotes.filter((note) => note.trackId === trackId),
    ),
    loadListeningNotes: vi.fn(async (trackId) =>
      listeningNotes.filter((note) => note.trackId === trackId),
    ),
    createTrackNote: vi.fn(async (input) => {
      const created = trackNote({
        id: `track-note-${trackNotes.length + 1}`,
        trackId: input.trackId,
        body: input.body.trim(),
      })
      trackNotes = [created, ...trackNotes]
      return created
    }),
    createListeningNote: vi.fn(async (input) => {
      const created = listeningNote({
        id: `listening-note-${listeningNotes.length + 1}`,
        playEventId: input.playEventId,
        trackId: input.trackId,
        body: input.body.trim(),
      })
      listeningNotes = [created, ...listeningNotes]
      return created
    }),
    updateTrackNote: vi.fn(async (input) => {
      const current = trackNotes.find((note) => note.id === input.id)!
      const updated = { ...current, body: input.body.trim() }
      trackNotes = trackNotes.map((note) =>
        note.id === updated.id ? updated : note,
      )
      return updated
    }),
    updateListeningNote: vi.fn(async (input) => {
      const current = listeningNotes.find((note) => note.id === input.id)!
      const updated = { ...current, body: input.body.trim() }
      listeningNotes = listeningNotes.map((note) =>
        note.id === updated.id ? updated : note,
      )
      return updated
    }),
    deleteTrackNote: vi.fn(async (input) => {
      const deleted = trackNotes.find((note) => note.id === input.id)
      if (deleted) deletedTrackNotes.set(deleted.id, deleted)
      trackNotes = trackNotes.filter((note) => note.id !== input.id)
    }),
    deleteListeningNote: vi.fn(async (input) => {
      const deleted = listeningNotes.find((note) => note.id === input.id)
      if (deleted) deletedListeningNotes.set(deleted.id, deleted)
      listeningNotes = listeningNotes.filter((note) => note.id !== input.id)
    }),
    restoreTrackNote: vi.fn(async (input) => {
      const restored = deletedTrackNotes.get(input.id)!
      trackNotes = [restored, ...trackNotes]
      return restored
    }),
    restoreListeningNote: vi.fn(async (input) => {
      const restored = deletedListeningNotes.get(input.id)!
      listeningNotes = [restored, ...listeningNotes]
      return restored
    }),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe('NotePanel Story 0007 contract', () => {
  it('keeps two non-timestamp Note types behind one compact Memo disclosure', async () => {
    const user = userEvent.setup()
    const gateway = createGateway([trackNote()], [listeningNote()])
    render(
      <NotePanel
        trackId="track-1"
        latestPlayEventId={null}
        gateway={gateway}
      />,
    )

    const disclosure = screen.getByText('メモ')
    expect(disclosure.closest('details')).not.toHaveAttribute('open')
    expect(screen.getByRole('heading', { name: 'Track Note' })).toBeInTheDocument()
    await user.click(disclosure)

    expect(
      await screen.findByRole('heading', { name: 'Track Note' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Listening Note' }),
    ).toBeInTheDocument()
    expect(screen.getByText('曲全体のベースを聴く')).toBeInTheDocument()
    expect(screen.getByText('今日はAメロがよかった')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Listening Note本文'),
    ).toBeDisabled()
    expect(screen.getByText('この曲を再生すると書けます。')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Marker')
  })

  it('creates Track and Listening Notes without changing the audio owner', async () => {
    const user = userEvent.setup()
    const gateway = createGateway()
    render(
      <NotePanel
        trackId="track-1"
        latestPlayEventId="event-1"
        gateway={gateway}
      />,
    )
    await user.click(screen.getByText('メモ'))

    await user.type(
      screen.getByLabelText('Track Note本文'),
      '  曲全体のコード進行  ',
    )
    await user.click(screen.getByRole('button', { name: 'Track Noteを追加' }))
    expect(gateway.createTrackNote).toHaveBeenCalledWith({
      trackId: 'track-1',
      body: '  曲全体のコード進行  ',
    })
    expect(await screen.findByText('曲全体のコード進行')).toBeInTheDocument()

    await user.type(
      screen.getByLabelText('Listening Note本文'),
      '  今日はAメロ  ',
    )
    await user.click(
      screen.getByRole('button', { name: 'Listening Noteを追加' }),
    )
    expect(gateway.createListeningNote).toHaveBeenCalledWith({
      playEventId: 'event-1',
      trackId: 'track-1',
      body: '  今日はAメロ  ',
    })
    expect(await screen.findByText('今日はAメロ')).toBeInTheDocument()
  })

  it('edits, confirms soft deletion, and restores the same Track Note with focus', async () => {
    const user = userEvent.setup()
    const original = trackNote()
    const gateway = createGateway([original])
    render(
      <NotePanel
        trackId="track-1"
        latestPlayEventId={null}
        gateway={gateway}
      />,
    )
    await user.click(screen.getByText('メモ'))

    const edit = await screen.findByRole('button', {
      name: 'Track Note「曲全体のベースを聴く」を編集',
    })
    await user.click(edit)
    const editBody = screen.getByLabelText('編集するTrack Note本文')
    expect(editBody).toHaveFocus()
    await user.clear(editBody)
    await user.type(editBody, 'ベースとコードを聴く')
    await user.click(screen.getByRole('button', { name: '変更を保存' }))
    expect(gateway.updateTrackNote).toHaveBeenCalledWith({
      id: original.id,
      trackId: 'track-1',
      body: 'ベースとコードを聴く',
    })
    expect(
      await screen.findByRole('button', {
        name: 'Track Note「ベースとコードを聴く」を削除',
      }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Track Note「ベースとコードを聴く」を削除',
      }),
    )
    expect(gateway.deleteTrackNote).not.toHaveBeenCalled()
    const confirm = screen.getByRole('button', {
      name: 'このTrack Noteを削除する',
    })
    expect(confirm).toHaveFocus()
    await user.click(confirm)
    const undo = await screen.findByRole('button', { name: '元に戻す' })
    expect(undo).toHaveFocus()
    await user.click(undo)
    expect(gateway.restoreTrackNote).toHaveBeenCalledWith({
      id: original.id,
      trackId: 'track-1',
    })
    expect(
      await screen.findByRole('button', {
        name: 'Track Note「ベースとコードを聴く」を編集',
      }),
    ).toHaveFocus()
  })

  it('isolates delayed loads and fixed failures by Track identity', async () => {
    const user = userEvent.setup()
    const firstTrackLoad = deferred<TrackNote[]>()
    const firstListeningLoad = deferred<ListeningNote[]>()
    const gateway = createGateway()
    vi.mocked(gateway.loadTrackNotes)
      .mockReturnValueOnce(firstTrackLoad.promise)
      .mockResolvedValueOnce([
        trackNote({ id: 'note-current', trackId: 'track-2', body: '現在の曲' }),
      ])
    vi.mocked(gateway.loadListeningNotes)
      .mockReturnValueOnce(firstListeningLoad.promise)
      .mockResolvedValueOnce([])
    const { rerender } = render(
      <NotePanel
        trackId="track-1"
        latestPlayEventId={null}
        gateway={gateway}
      />,
    )

    rerender(
      <NotePanel
        trackId="track-2"
        latestPlayEventId={null}
        gateway={gateway}
      />,
    )
    await user.click(screen.getByText('メモ'))
    expect(await screen.findByText('現在の曲')).toBeInTheDocument()

    await act(async () => {
      firstTrackLoad.resolve([
        trackNote({ body: '/private/old-track.wav SELECT *' }),
      ])
      firstListeningLoad.reject(new Error('/private/old-track.wav'))
      await Promise.allSettled([
        firstTrackLoad.promise,
        firstListeningLoad.promise,
      ])
    })
    expect(screen.getByText('現在の曲')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('/private/')
    expect(document.body.textContent).not.toContain('SELECT *')

    vi.mocked(gateway.createTrackNote).mockRejectedValueOnce(
      new Error('/private/current.wav INSERT track_notes'),
    )
    await user.type(screen.getByLabelText('Track Note本文'), '保存失敗')
    await user.click(screen.getByRole('button', { name: 'Track Noteを追加' }))
    expect(
      await screen.findByRole('alert', { name: 'Track Note保存エラー' }),
    ).toHaveTextContent('Track Noteを保存できませんでした。入力は保持しています。')
    expect(document.body.textContent).not.toContain('/private/current')
    expect(document.body.textContent).not.toContain('INSERT track_notes')
  })

  it('does not submit blank Note bodies', async () => {
    const user = userEvent.setup()
    const gateway = createGateway()
    render(
      <NotePanel
        trackId="track-1"
        latestPlayEventId="event-1"
        gateway={gateway}
      />,
    )
    await user.click(screen.getByText('メモ'))

    await user.type(screen.getByLabelText('Track Note本文'), '   ')
    await user.type(screen.getByLabelText('Listening Note本文'), '\n\t')
    expect(
      screen.getByRole('button', { name: 'Track Noteを追加' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Listening Noteを追加' }),
    ).toBeDisabled()
    expect(gateway.createTrackNote).not.toHaveBeenCalled()
    expect(gateway.createListeningNote).not.toHaveBeenCalled()
  })
})

describe('NotePanel Story 0012 time context', () => {
  it('shows local creation time only to the minute and preserves the stored value', async () => {
    const user = userEvent.setup()
    const createdAt = new Date(2026, 8, 2, 13, 20, 9, 598).toISOString()
    const displayTime = new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(createdAt))
    const gateway = createGateway(
      [trackNote({ createdAt })],
      [listeningNote({ createdAt })],
    )

    render(
      <NotePanel
        trackId="track-1"
        latestPlayEventId={null}
        gateway={gateway}
      />,
    )
    await user.click(screen.getByText('メモ'))

    const times = screen.getAllByText(`記録 ${displayTime}`)
    expect(times).toHaveLength(2)
    expect(times.every((time) => time.tagName === 'TIME')).toBe(true)
    expect(times.every((time) => time.getAttribute('datetime') === createdAt)).toBe(
      true,
    )
    expect(document.body.textContent).not.toContain(createdAt)
    expect(document.body.textContent).not.toContain(':09')
  })

  it('shows Listening Note playback or loop range and seeks to its musical start', async () => {
    const user = userEvent.setup()
    const onSelectPositionMs = vi.fn()
    const gateway = createGateway([], [
      listeningNote({
        id: 'note-open',
        body: 'サビへ入る直前',
        playEventStartPositionMs: 12_000,
        playEventEndPositionMs: null,
      }),
      listeningNote({
        id: 'note-loop',
        body: 'この二小節を反復',
        playEventStartPositionMs: 25_000,
        playEventEndPositionMs: 60_000,
        playEventLoopStartMs: 30_000,
        playEventLoopEndMs: 42_000,
      }),
    ])

    render(
      <Story0012NotePanel
        trackId="track-1"
        latestPlayEventId={null}
        gateway={gateway}
        onSelectPositionMs={onSelectPositionMs}
      />,
    )
    await user.click(screen.getByText('メモ'))

    const openRange = await screen.findByRole('button', {
      name: 'Listening Noteの再生区間 0:12から聴く',
    })
    expect(openRange).toHaveTextContent('再生区間 0:12から')
    const loopRange = screen.getByRole('button', {
      name: 'Listening Noteのループ区間 0:30から聴く',
    })
    expect(loopRange).toHaveTextContent('ループ区間 0:30–0:42')

    await user.click(openRange)
    await user.click(loopRange)
    expect(onSelectPositionMs).toHaveBeenNthCalledWith(1, 12_000)
    expect(onSelectPositionMs).toHaveBeenNthCalledWith(2, 30_000)
  })
})
