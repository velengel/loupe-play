import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://localhost${path}`),
  execute: vi.fn(),
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

describe('tauriFoundationGateway', () => {
  beforeEach(() => {
    let writtenProbe: unknown
    let storedTrackIdentity: unknown[] | null = null

    vi.clearAllMocks()
    mocks.close.mockResolvedValue(undefined)
    mocks.execute.mockImplementation(
      async (query: string, values: unknown[] = []) => {
        writtenProbe = values[0]
        if (query.includes('INSERT INTO track_identities')) {
          storedTrackIdentity = values
        }
        return { rowsAffected: 1 }
      },
    )
    mocks.select.mockImplementation(
      async (query: string, values: unknown[] = []) => {
        if (query.includes('FROM track_identities')) {
          return storedTrackIdentity
            ? [
                {
                  id: storedTrackIdentity[0],
                  music_folder_id: storedTrackIdentity[1],
                  source: storedTrackIdentity[2],
                  source_identifier: storedTrackIdentity[3],
                },
              ]
            : []
        }

        return [{ probe: values[0] ?? writtenProbe }]
      },
    )
    const database = {
      close: mocks.close,
      execute: mocks.execute,
      select: mocks.select,
    }
    mocks.get.mockReturnValue(database)
    mocks.load.mockResolvedValue(database)
  })

  it('uses only the preloaded LoupePlay database', async () => {
    await expect(
      tauriFoundationGateway.checkDatabase(),
    ).resolves.toBeUndefined()

    expect(mocks.get).toHaveBeenCalledWith('sqlite:loupe-play.db')
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.select).toHaveBeenCalledWith(
      expect.stringContaining('RETURNING probe'),
      [expect.stringMatching(/^loupe-play-/), expect.any(String)],
    )
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.close).not.toHaveBeenCalled()
  })

  it('shares a database check that is already in flight', async () => {
    let resolveCheck!: () => void
    mocks.select.mockImplementationOnce(
      async (_query: string, values: unknown[] = []) =>
        new Promise<Array<{ probe: unknown }>>((resolve) => {
          resolveCheck = () => resolve([{ probe: values[0] }])
        }),
    )

    const first = tauriFoundationGateway.checkDatabase()
    const second = tauriFoundationGateway.checkDatabase()
    await Promise.resolve()

    expect(mocks.get).toHaveBeenCalledOnce()
    expect(mocks.select).toHaveBeenCalledOnce()

    resolveCheck()
    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ])
  })

  it('opens one recursive directory selection and scans it', async () => {
    mocks.open.mockResolvedValue('/Music')
    mocks.readDir.mockResolvedValue([
      {
        name: 'take.FLAC',
        isDirectory: false,
        isFile: true,
        isSymlink: false,
      },
    ])
    mocks.invoke.mockResolvedValue([
      {
        index: 0,
        title: 'take',
        artist: null,
        album: null,
        durationMs: 1000,
        status: 'fallback',
        failureKind: 'missing-tags',
      },
    ])
    mocks.select.mockImplementation(async (query: string) => {
      if (query.includes('FROM music_folders')) {
        return []
      }

      if (query.includes('FROM track_identities')) {
        const identityWrite = mocks.execute.mock.calls.find(([statement]) =>
          String(statement).includes('INSERT INTO track_identities'),
        )
        const values = identityWrite?.[1] as unknown[] | undefined
        return values
          ? [
              {
                id: values[0],
                music_folder_id: values[1],
                source: values[2],
                source_identifier: values[3],
              },
            ]
          : []
      }

      return []
    })

    await expect(
      tauriFoundationGateway.chooseMusicFolder(),
    ).resolves.toMatchObject({
      kind: 'committed',
      snapshot: {
        access: 'granted',
        scan: { completeness: 'complete', issues: [] },
        tracks: [
          {
            fileName: 'take.FLAC',
            relativePath: 'take.FLAC',
            title: 'take',
            presence: 'present',
          },
        ],
      },
    })
    expect(mocks.open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      recursive: true,
      title: 'LoupePlay で開く音楽フォルダを選ぶ',
    })
    expect(mocks.readDir).toHaveBeenCalledWith('/Music')
    expect(mocks.invoke).toHaveBeenCalledWith('read_audio_metadata', {
      root: '/Music',
      paths: ['/Music/take.FLAC'],
    })
  })

  it('returns no folder when the dialog is cancelled', async () => {
    mocks.open.mockResolvedValue(null)

    await expect(
      tauriFoundationGateway.chooseMusicFolder(),
    ).resolves.toEqual({ kind: 'cancelled' })
    expect(mocks.readDir).not.toHaveBeenCalled()
  })

  it('opens only the explicitly selected music files without scanning their parents', async () => {
    const selectedPaths = [
      '/Music/Session/take.mp3',
      '/Archive/Reference/take.flac',
    ]
    mocks.open.mockResolvedValue(selectedPaths)
    mocks.invoke.mockResolvedValue([
      {
        index: 0,
        title: 'First take',
        artist: null,
        album: null,
        durationMs: 1_000,
        status: 'fallback',
        failureKind: 'missing-tags',
      },
      {
        index: 1,
        title: 'Reference take',
        artist: 'Fixture Artist',
        album: null,
        durationMs: 2_000,
        status: 'tagged',
      },
    ])
    mocks.select.mockImplementation(async (query: string) => {
      if (query.includes('FROM music_folders')) {
        return []
      }

      if (query.includes('FROM track_identities')) {
        const identityWrites = mocks.execute.mock.calls.filter(([statement]) =>
          String(statement).includes('INSERT INTO track_identities'),
        )
        const values = identityWrites.at(-1)?.[1] as unknown[] | undefined
        return values
          ? [
              {
                id: values[0],
                music_folder_id: values[1],
                source: values[2],
                source_identifier: values[3],
              },
            ]
          : []
      }

      return []
    })

    await expect(
      tauriFoundationGateway.chooseMusicFiles(),
    ).resolves.toMatchObject({
      kind: 'committed',
      snapshot: {
        folder: {
          rootPath: 'loupe-play:selected-files:v1',
          displayName: '選択した曲',
        },
        access: 'granted',
        scan: { completeness: 'complete', issues: [] },
        tracks: [
          {
            sourceIdentifier: selectedPaths[0],
            relativePath: 'take.mp3',
            fileName: 'take.mp3',
            title: 'First take',
            presence: 'present',
          },
          {
            sourceIdentifier: selectedPaths[1],
            relativePath: 'take.flac',
            fileName: 'take.flac',
            title: 'Reference take',
            presence: 'present',
          },
        ],
      },
    })
    expect(mocks.open).toHaveBeenCalledWith({
      directory: false,
      multiple: true,
      filters: [
        { name: '音楽ファイル', extensions: ['wav', 'mp3', 'flac'] },
      ],
      title: 'LoupePlay で開く音楽ファイルを選ぶ',
    })
    expect(mocks.readDir).not.toHaveBeenCalled()
    expect(mocks.invoke).toHaveBeenCalledWith(
      'read_selected_audio_metadata',
      { paths: selectedPaths },
    )
  })

  it('converts only the selected track path to an asset URL', () => {
    expect(tauriFoundationGateway.toAudioUrl('/Music/take.wav')).toBe(
      'asset://localhost/Music/take.wav',
    )
    expect(mocks.convertFileSrc).toHaveBeenCalledWith('/Music/take.wav')
  })
})
