import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  convertFileSrc: vi.fn((path: string) => `asset://localhost${path}`),
  execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  get: vi.fn(),
  invoke: vi.fn(),
  isTauri: vi.fn(),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
  load: vi.fn(),
  open: vi.fn(),
  readDir: vi.fn(),
  select: vi.fn(),
}))

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

import { tauriFoundationGateway } from './tauri-foundation'

const persistedSnapshotRow = {
  snapshot_id: 'snapshot-remembered',
  folder_id: 'folder-remembered',
  root_path: '/Fixture Music',
  display_name: 'Fixture Music',
  selected_at: '2026-09-01T00:00:00.000Z',
  sequence: 1,
  folder_generation: 1,
}

const persistedTrackRow = {
  id: 'track-remembered',
  library_snapshot_id: 'snapshot-remembered',
  music_folder_id: 'folder-remembered',
  source: 'local',
  source_identifier: 'take.mp3',
  path: '/Fixture Music/take.mp3',
  relative_path: 'take.mp3',
  file_name: 'take.mp3',
  format: 'mp3',
  title: 'Remembered take',
  artist: null,
  album: null,
  duration_ms: 1_234,
  metadata_status: 'tagged',
  updated_at: '2026-09-01T00:00:00.000Z',
}

function arrangePersistedLibrary() {
  mocks.select.mockImplementation(async (query: string) => {
    if (query.includes('FROM library_publications')) {
      return [persistedSnapshotRow]
    }

    if (query.includes('FROM tracks')) {
      return [persistedTrackRow]
    }

    if (query.includes('FROM music_folders')) {
      return [
        {
          id: persistedSnapshotRow.folder_id,
          root_path: persistedSnapshotRow.root_path,
          display_name: persistedSnapshotRow.display_name,
        },
      ]
    }

    if (query.includes('FROM track_identities')) {
      return [
        {
          id: persistedTrackRow.id,
          music_folder_id: persistedTrackRow.music_folder_id,
          source: persistedTrackRow.source,
          source_identifier: persistedTrackRow.source_identifier,
        },
      ]
    }

    throw new Error(`unexpected query: ${query}`)
  })
}

describe('tauriFoundationGateway Story 0010 recent library boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execute.mockResolvedValue({ rowsAffected: 1 })
    mocks.get.mockReturnValue({
      execute: mocks.execute,
      select: mocks.select,
    })
    arrangePersistedLibrary()
    mocks.invoke.mockResolvedValue([
      {
        index: 0,
        title: 'Fresh take',
        artist: 'Fixture artist',
        album: null,
        durationMs: 2_468,
        status: 'tagged',
      },
    ])
  })

  it('reopens one restored recent folder without a dialog and shares an in-flight scan', async () => {
    let resolveRead!: (entries: unknown[]) => void
    mocks.readDir.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRead = resolve
      }),
    )

    const first = tauriFoundationGateway.loadLibrary()
    const second = tauriFoundationGateway.loadLibrary()

    await vi.waitFor(() => expect(mocks.readDir).toHaveBeenCalledOnce())
    expect(mocks.readDir).toHaveBeenCalledWith('/Fixture Music')
    expect(mocks.open).not.toHaveBeenCalled()

    resolveRead([
      {
        name: 'take.mp3',
        isDirectory: false,
        isFile: true,
        isSymlink: false,
      },
    ])

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({
        access: 'granted',
        scan: { completeness: 'complete', issues: [] },
        tracks: [
          expect.objectContaining({
            id: 'track-remembered',
            title: 'Fresh take',
            presence: 'present',
          }),
        ],
      }),
      expect.objectContaining({
        access: 'granted',
        tracks: [expect.objectContaining({ id: 'track-remembered' })],
      }),
    ])
    expect(mocks.readDir).toHaveBeenCalledOnce()
    expect(mocks.invoke).toHaveBeenCalledOnce()
    expect(
      mocks.execute.mock.calls.filter(([query]) =>
        String(query).includes('INSERT INTO library_publications'),
      ),
    ).toHaveLength(1)
  })

  it('keeps the remembered library when its persisted scope cannot reopen the root', async () => {
    mocks.readDir.mockRejectedValueOnce(new Error('scope unavailable'))

    await expect(tauriFoundationGateway.loadLibrary()).resolves.toMatchObject({
      folder: {
        id: 'folder-remembered',
        displayName: 'Fixture Music',
      },
      access: 'permission-required',
      scan: { completeness: 'not-run', issues: [] },
      tracks: [
        {
          id: 'track-remembered',
          title: 'Remembered take',
          presence: 'unknown',
        },
      ],
    })
    expect(mocks.readDir).toHaveBeenCalledWith('/Fixture Music')
    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('reopens the last exact file selection without scanning either parent folder', async () => {
    const selectedPath = '/Fixture Music/Session/take.mp3'
    const selectedSnapshotRow = {
      ...persistedSnapshotRow,
      root_path: 'loupe-play:selected-files:v1',
      display_name: '選択した曲',
    }
    const selectedTrackRow = {
      ...persistedTrackRow,
      source_identifier: selectedPath,
      path: selectedPath,
    }
    mocks.select.mockImplementation(async (query: string) => {
      if (query.includes('FROM library_publications')) {
        return [selectedSnapshotRow]
      }
      if (query.includes('FROM tracks')) {
        return [selectedTrackRow]
      }
      if (query.includes('FROM music_folders')) {
        return [
          {
            id: selectedSnapshotRow.folder_id,
            root_path: selectedSnapshotRow.root_path,
            display_name: selectedSnapshotRow.display_name,
          },
        ]
      }
      if (query.includes('FROM track_identities')) {
        return [
          {
            id: selectedTrackRow.id,
            music_folder_id: selectedTrackRow.music_folder_id,
            source: selectedTrackRow.source,
            source_identifier: selectedTrackRow.source_identifier,
          },
        ]
      }
      throw new Error(`unexpected query: ${query}`)
    })

    await expect(tauriFoundationGateway.loadLibrary()).resolves.toMatchObject({
      folder: {
        rootPath: 'loupe-play:selected-files:v1',
        displayName: '選択した曲',
      },
      access: 'granted',
      tracks: [
        {
          id: 'track-remembered',
          sourceIdentifier: selectedPath,
          relativePath: 'take.mp3',
          presence: 'present',
        },
      ],
    })
    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.readDir).not.toHaveBeenCalled()
    expect(mocks.invoke).toHaveBeenCalledWith(
      'read_selected_audio_metadata',
      { paths: [selectedPath] },
    )
  })

  it('keeps a remembered file selection when any exact scope is unavailable', async () => {
    const selectedPath = '/Fixture Music/Session/take.mp3'
    const selectedSnapshotRow = {
      ...persistedSnapshotRow,
      root_path: 'loupe-play:selected-files:v1',
      display_name: '選択した曲',
    }
    const selectedTrackRow = {
      ...persistedTrackRow,
      source_identifier: selectedPath,
      path: selectedPath,
    }
    mocks.select.mockImplementation(async (query: string) => {
      if (query.includes('FROM library_publications')) {
        return [selectedSnapshotRow]
      }
      if (query.includes('FROM tracks')) {
        return [selectedTrackRow]
      }
      throw new Error(`unexpected query after scope failure: ${query}`)
    })
    mocks.invoke.mockResolvedValueOnce([
      {
        index: 0,
        title: 'take',
        artist: null,
        album: null,
        durationMs: null,
        status: 'fallback',
        failureKind: 'scope-denied',
      },
    ])

    await expect(tauriFoundationGateway.loadLibrary()).resolves.toMatchObject({
      folder: { displayName: '選択した曲' },
      access: 'permission-required',
      tracks: [
        {
          id: 'track-remembered',
          sourceIdentifier: selectedPath,
          presence: 'unknown',
        },
      ],
    })
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.readDir).not.toHaveBeenCalled()
  })
})
