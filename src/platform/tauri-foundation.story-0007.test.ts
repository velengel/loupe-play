import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackNote = {
  id: 'note-1',
  trackId: 'track-1',
  body: '曲全体のベースを聴く',
  createdAt: '2026-09-02T11:00:00.000Z',
  updatedAt: '2026-09-02T11:00:00.000Z',
}

const listeningNote = {
  ...trackNote,
  playEventId: 'event-1',
  body: '今日はAメロがよかった',
  playEventStartedAt: '2026-09-02T10:00:00.000Z',
  playEventStartPositionMs: 1_000,
  playEventEndPositionMs: null,
  playEventLoopStartMs: null,
  playEventLoopEndMs: null,
}

const playEvent = {
  id: 'event-1',
  trackId: 'track-1',
  startedAt: '2026-09-02T10:00:00.000Z',
  endedAt: null,
  startPositionMs: 1_000,
  endPositionMs: null,
  mode: 'listen' as const,
  playbackRate: 1,
  loopStartMs: null,
  loopEndMs: null,
  closedReason: null,
  recoveredAt: null,
}

const mocks = vi.hoisted(() => {
  const noteRepository = {
    loadTrackNotes: vi.fn(),
    loadListeningNotes: vi.fn(),
    createTrackNote: vi.fn(),
    createListeningNote: vi.fn(),
    updateTrackNote: vi.fn(),
    updateListeningNote: vi.fn(),
    deleteTrackNote: vi.fn(),
    deleteListeningNote: vi.fn(),
    restoreTrackNote: vi.fn(),
    restoreListeningNote: vi.fn(),
  }
  const playEventRepository = {
    loadPlayEvents: vi.fn(),
    startPlayEvent: vi.fn(),
    closePlayEvent: vi.fn(),
  }
  return {
    convertFileSrc: vi.fn(),
    createMarkerRepository: vi.fn(() => ({})),
    createNoteRepository: vi.fn(() => noteRepository),
    createPlayEventRepository: vi.fn(() => playEventRepository),
    get: vi.fn(),
    invoke: vi.fn(),
    isTauri: vi.fn(),
    join: vi.fn(),
    load: vi.fn(),
    noteRepository,
    open: vi.fn(),
    playEventRepository,
    readDir: vi.fn(),
  }
})

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: mocks.convertFileSrc,
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}))
vi.mock('@tauri-apps/api/path', () => ({ join: mocks.join }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open }))
vi.mock('@tauri-apps/plugin-fs', () => ({ readDir: mocks.readDir }))
vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { get: mocks.get, load: mocks.load },
}))
vi.mock('../lib/marker-repository', () => ({
  createMarkerRepository: mocks.createMarkerRepository,
}))
vi.mock('../lib/note-repository', () => ({
  createNoteRepository: mocks.createNoteRepository,
}))
vi.mock('../lib/play-event-repository', () => ({
  createPlayEventRepository: mocks.createPlayEventRepository,
}))

import { tauriFoundationGateway } from './tauri-foundation'

describe('tauriFoundationGateway Story 0007 engagement boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockReturnValue({ execute: vi.fn(), select: vi.fn() })
    mocks.noteRepository.loadTrackNotes.mockResolvedValue([trackNote])
    mocks.noteRepository.loadListeningNotes.mockResolvedValue([listeningNote])
    mocks.noteRepository.createTrackNote.mockResolvedValue(trackNote)
    mocks.noteRepository.createListeningNote.mockResolvedValue(listeningNote)
    mocks.noteRepository.updateTrackNote.mockResolvedValue(trackNote)
    mocks.noteRepository.updateListeningNote.mockResolvedValue(listeningNote)
    mocks.noteRepository.deleteTrackNote.mockResolvedValue(undefined)
    mocks.noteRepository.deleteListeningNote.mockResolvedValue(undefined)
    mocks.noteRepository.restoreTrackNote.mockResolvedValue(trackNote)
    mocks.noteRepository.restoreListeningNote.mockResolvedValue(listeningNote)
    mocks.playEventRepository.loadPlayEvents.mockResolvedValue([playEvent])
    mocks.playEventRepository.startPlayEvent.mockResolvedValue(playEvent)
    mocks.playEventRepository.closePlayEvent.mockResolvedValue({
      ...playEvent,
      endedAt: '2026-09-02T10:01:00.000Z',
      endPositionMs: 2_000,
      closedReason: 'pause',
    })
  })

  it('delegates every Note and PlayEvent operation through the fixed database', async () => {
    const identity = { id: 'note-1', trackId: 'track-1' }
    await tauriFoundationGateway.loadTrackNotes('track-1')
    await tauriFoundationGateway.loadListeningNotes('track-1')
    await tauriFoundationGateway.createTrackNote({
      trackId: 'track-1',
      body: '本文',
    })
    await tauriFoundationGateway.createListeningNote({
      playEventId: 'event-1',
      trackId: 'track-1',
      body: '本文',
    })
    await tauriFoundationGateway.updateTrackNote({ ...identity, body: '更新' })
    await tauriFoundationGateway.updateListeningNote({
      ...identity,
      body: '更新',
    })
    await tauriFoundationGateway.deleteTrackNote(identity)
    await tauriFoundationGateway.deleteListeningNote(identity)
    await tauriFoundationGateway.restoreTrackNote(identity)
    await tauriFoundationGateway.restoreListeningNote(identity)
    await tauriFoundationGateway.loadPlayEvents('track-1')
    await tauriFoundationGateway.startPlayEvent({
      trackId: 'track-1',
      startPositionMs: 1_000,
      mode: 'listen',
      playbackRate: 1,
      loopStartMs: null,
      loopEndMs: null,
    })
    await tauriFoundationGateway.closePlayEvent({
      id: 'event-1',
      trackId: 'track-1',
      endPositionMs: 2_000,
      reason: 'pause',
    })

    expect(mocks.get).toHaveBeenCalledTimes(13)
    expect(mocks.get.mock.calls).toEqual(
      Array.from({ length: 13 }, () => ['sqlite:loupe-play.db']),
    )
    expect(mocks.createNoteRepository).toHaveBeenCalledTimes(10)
    expect(mocks.createPlayEventRepository).toHaveBeenCalledTimes(3)
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.readDir).not.toHaveBeenCalled()
    expect(mocks.convertFileSrc).not.toHaveBeenCalled()
  })
})
