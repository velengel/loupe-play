import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  LibraryOperationResult,
  LibrarySnapshot,
} from '../lib/library-model'

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

import {
  applyCommittedLibraryIdentity,
  tauriFoundationGateway,
} from './tauri-foundation'

interface Story0003Gateway {
  loadLibrary: () => Promise<LibrarySnapshot | null>
  reconnectMusicFolder: (
    folderId: string,
  ) => Promise<LibraryOperationResult>
}

const story0003Gateway =
  tauriFoundationGateway as typeof tauriFoundationGateway & Story0003Gateway

function arrangeSingleTrackMetadata(
  failureKind: string,
  durationMs: number | null = null,
) {
  mocks.open.mockResolvedValue('/Synthetic Music')
  mocks.readDir.mockResolvedValue([
    {
      name: 'take.wav',
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
      durationMs,
      status: 'fallback',
      failureKind,
    },
  ])
  mocks.select.mockImplementation(async (query: string) => {
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
}

function createSyntheticSnapshot(): LibrarySnapshot {
  return {
    folder: {
      id: 'folder-proposal',
      rootPath: '/Synthetic Music',
      displayName: 'Synthetic Music',
      selectedAt: null,
    },
    access: 'granted',
    scan: { completeness: 'complete', issues: [] },
    tracks: [
      {
        id: 'track-proposal',
        musicFolderId: 'folder-proposal',
        source: 'local',
        sourceIdentifier: 'take.wav',
        path: '/Synthetic Music/take.wav',
        relativePath: 'take.wav',
        fileName: 'take.wav',
        format: 'wav',
        title: 'take',
        artist: null,
        album: null,
        durationMs: 1_000,
        metadataStatus: 'fallback',
        presence: 'present',
      },
    ],
  }
}

describe('tauriFoundationGateway Story 0003 boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execute.mockReset()
    mocks.invoke.mockReset()
    mocks.open.mockReset()
    mocks.readDir.mockReset()
    mocks.select.mockReset()
    mocks.get.mockReturnValue({
      execute: mocks.execute,
      select: mocks.select,
    })
    mocks.execute.mockResolvedValue({ rowsAffected: 1 })
  })

  it('rejects an incomplete canonical Track mapping instead of using a proposed ID', () => {
    const snapshot = createSyntheticSnapshot()

    expect(() =>
      applyCommittedLibraryIdentity(snapshot, {
        folderId: 'folder-canonical',
        selectedAt: '2026-09-02T00:00:01.000Z',
        trackIdsBySourceIdentifier: {},
      }),
    ).toThrow('canonical Track identity')
  })

  it('does not accept inherited object properties as canonical Track IDs', () => {
    const snapshot = createSyntheticSnapshot()
    snapshot.tracks[0].sourceIdentifier = 'toString'

    expect(() =>
      applyCommittedLibraryIdentity(snapshot, {
        folderId: 'folder-canonical',
        selectedAt: '2026-09-02T00:00:01.000Z',
        trackIdsBySourceIdentifier: {},
      }),
    ).toThrow('canonical Track identity')
  })

  it('projects every committed identity field without changing the prepared snapshot', () => {
    const snapshot = createSyntheticSnapshot()
    const preparedSnapshot = structuredClone(snapshot)

    const committed = applyCommittedLibraryIdentity(snapshot, {
      folderId: 'folder-canonical',
      selectedAt: '2026-09-02T00:00:01.000Z',
      trackIdsBySourceIdentifier: {
        'take.wav': 'track-canonical',
      },
    })

    expect(committed).toMatchObject({
      folder: {
        id: 'folder-canonical',
        rootPath: '/Synthetic Music',
        selectedAt: '2026-09-02T00:00:01.000Z',
      },
      access: 'granted',
      tracks: [
        {
          id: 'track-canonical',
          musicFolderId: 'folder-canonical',
          sourceIdentifier: 'take.wav',
          title: 'take',
          presence: 'present',
        },
      ],
    })
    expect(snapshot).toEqual(preparedSnapshot)
    expect(committed).not.toBe(snapshot)
    expect(committed.folder).not.toBe(snapshot.folder)
    expect(committed.tracks[0]).not.toBe(snapshot.tracks[0])
  })

  it('falls back to remembered rows when restored scope cannot open the root', async () => {
    mocks.select.mockImplementation(async (query: string) => {
      if (query.includes('FROM library_publications')) {
        return [
          {
            snapshot_id: 'snapshot-1',
            folder_id: 'folder-1',
            root_path: '/Synthetic Music',
            display_name: 'Synthetic Music',
            selected_at: '2026-09-01T00:00:00.000Z',
            sequence: 1,
            folder_generation: 1,
          },
        ]
      }

      if (query.includes('FROM tracks')) {
        return [
          {
            id: 'track-1',
            library_snapshot_id: 'snapshot-1',
            music_folder_id: 'folder-1',
            source: 'local',
            source_identifier: 'sessions/take.flac',
            path: '/Synthetic Music/sessions/take.flac',
            relative_path: 'sessions/take.flac',
            file_name: 'take.flac',
            format: 'flac',
            title: 'Take',
            artist: null,
            album: null,
            duration_ms: 1234,
            metadata_status: 'tagged',
          },
        ]
      }

      throw new Error(`unexpected query: ${query}`)
    })

    await expect(story0003Gateway.loadLibrary()).resolves.toMatchObject({
      folder: {
        id: 'folder-1',
        rootPath: '/Synthetic Music',
        displayName: 'Synthetic Music',
      },
      access: 'permission-required',
      scan: { completeness: 'not-run', issues: [] },
      tracks: [
        {
          id: 'track-1',
          sourceIdentifier: 'sessions/take.flac',
          relativePath: 'sessions/take.flac',
          presence: 'unknown',
        },
      ],
    })
    expect(mocks.get).toHaveBeenCalledWith('sqlite:loupe-play.db')
    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.readDir).toHaveBeenCalledWith('/Synthetic Music')
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.convertFileSrc).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('requires an explicit recursive folder choice when reconnecting', async () => {
    mocks.select.mockImplementation(async (query: string) => {
      if (query.includes('FROM library_publications')) {
        return [
          {
            snapshot_id: 'snapshot-1',
            folder_id: 'folder-1',
            root_path: '/Synthetic Music',
            display_name: 'Synthetic Music',
            selected_at: '2026-09-01T00:00:00.000Z',
            sequence: 1,
            folder_generation: 1,
          },
        ]
      }

      if (query.includes('FROM tracks')) {
        return []
      }

      throw new Error(`unexpected query: ${query}`)
    })
    mocks.open.mockResolvedValue(null)

    await expect(
      story0003Gateway.reconnectMusicFolder('folder-1'),
    ).resolves.toEqual({ kind: 'cancelled' })

    expect(mocks.open).toHaveBeenCalledWith({
      defaultPath: '/Synthetic Music',
      directory: true,
      multiple: false,
      recursive: true,
      title: 'LoupePlay の音楽フォルダを再接続する',
    })
    expect(mocks.readDir).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('extracts metadata before bound inserts and publishes the snapshot last', async () => {
    mocks.open.mockResolvedValue('/Synthetic Music')
    mocks.readDir.mockImplementation(async (path: string) => {
      if (path === '/Synthetic Music') {
        return [
          {
            name: 'sessions',
            isDirectory: true,
            isFile: false,
            isSymlink: false,
          },
        ]
      }

      return [
        {
          name: 'take.flac',
          isDirectory: false,
          isFile: true,
          isSymlink: false,
        },
      ]
    })
    mocks.invoke.mockResolvedValue([
      {
        index: 0,
        title: 'Measured take',
        artist: 'Test artist',
        album: null,
        durationMs: 2468,
        status: 'tagged',
      },
    ])
    let trackReadCount = 0
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
                id: 'track-canonical',
                music_folder_id: values[1],
                source: values[2],
                source_identifier: values[3],
              },
            ]
          : []
      }

      if (query.includes('FROM tracks')) {
        trackReadCount += 1
        return trackReadCount === 1
          ? []
          : [
              {
                id: 'track-new',
                music_folder_id: 'folder-new',
                source: 'local',
                source_identifier: 'sessions/take.flac',
                path: '/Synthetic Music/sessions/take.flac',
                relative_path: 'sessions/take.flac',
                file_name: 'take.flac',
                format: 'flac',
                title: 'Measured take',
                artist: 'Test artist',
                album: null,
                duration_ms: 2468,
                metadata_status: 'tagged',
              },
            ]
      }

      return []
    })

    await expect(
      tauriFoundationGateway.chooseMusicFolder(),
    ).resolves.toMatchObject({
      kind: 'committed',
      snapshot: {
        access: 'granted',
        scan: { completeness: 'complete' },
        tracks: [
          {
            id: 'track-canonical',
            sourceIdentifier: 'sessions/take.flac',
            title: 'Measured take',
            presence: 'present',
          },
        ],
      },
    })

    expect(mocks.invoke).toHaveBeenCalledWith('read_audio_metadata', {
      root: '/Synthetic Music',
      paths: ['/Synthetic Music/sessions/take.flac'],
    })
    const statements = mocks.execute.mock.calls.map(
      ([query]) => query as string,
    )
    expect(statements.some((query) => query.includes('DELETE'))).toBe(false)
    expect(statements[0]).toContain('INSERT INTO music_folders')
    expect(
      statements.some((query) => query.includes('INSERT INTO library_snapshots')),
    ).toBe(true)
    expect(statements.some((query) => query.includes('INSERT INTO tracks'))).toBe(
      true,
    )
    expect(statements.at(-1)).toMatch(
      /INSERT INTO library_publications[\s\S]*selected_at/,
    )
    expect(mocks.execute.mock.calls.at(-1)?.[1]).toContain(1)
    expect(statements.join('\n')).not.toContain('Measured take')
    expect(
      mocks.execute.mock.calls.some(([, values]) =>
        (values as unknown[]).includes('Measured take'),
      ),
    ).toBe(true)
  })

  it('does not mutate the library when the metadata command fails as a whole', async () => {
    mocks.open.mockResolvedValue('/Synthetic Music')
    mocks.readDir.mockResolvedValue([
      {
        name: 'take.wav',
        isDirectory: false,
        isFile: true,
        isSymlink: false,
      },
    ])
    mocks.invoke.mockRejectedValue(new Error('metadata command unavailable'))

    await expect(
      tauriFoundationGateway.chooseMusicFolder(),
    ).rejects.toThrow('metadata command unavailable')
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('carries the scanned folder generation into publication and rejects a stale commit', async () => {
    mocks.open.mockResolvedValue('/Synthetic Music')
    mocks.readDir.mockResolvedValue([
      {
        name: 'take.wav',
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
        durationMs: 2_468,
        status: 'fallback',
        failureKind: 'missing-tags',
      },
    ])
    mocks.select.mockImplementation(async (query: string) => {
      if (query.includes('FROM library_publications')) {
        return [
          {
            snapshot_id: 'snapshot-base',
            folder_id: 'folder-base',
            root_path: '/Synthetic Music',
            display_name: 'Synthetic Music',
            selected_at: '2026-09-02T00:00:00.000Z',
            sequence: 4,
            folder_generation: 4,
          },
        ]
      }

      if (query.includes('FROM tracks')) {
        return []
      }

      if (query.includes('FROM music_folders')) {
        return [
          {
            id: 'folder-base',
            root_path: '/Synthetic Music',
            display_name: 'Synthetic Music',
          },
        ]
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
    mocks.execute.mockImplementation(async (query: string) => {
      if (query.includes('INSERT INTO library_publications')) {
        throw new Error(
          'UNIQUE constraint failed: library_publications.music_folder_id, library_publications.folder_generation',
        )
      }

      return { rowsAffected: 1 }
    })

    await expect(
      tauriFoundationGateway.chooseMusicFolder(),
    ).rejects.toThrow('folder_generation')

    const publication = mocks.execute.mock.calls.find(([query]) =>
      String(query).includes('INSERT INTO library_publications'),
    )
    expect(publication?.[1]).toEqual(
      expect.arrayContaining(['folder-base', 5]),
    )
  })

  it.each([
    'scope-denied',
    'outside-root',
    'symlink',
    'not-regular-file',
    'unsupported-format',
    'unreadable',
    'invalid-metadata',
  ])(
    'keeps a %s candidate visible but not playable',
    async (failureKind) => {
      arrangeSingleTrackMetadata(failureKind)

      await expect(
        tauriFoundationGateway.chooseMusicFolder(),
      ).resolves.toMatchObject({
        kind: 'committed',
        snapshot: {
          access: 'granted',
          tracks: [
            {
              sourceIdentifier: 'take.wav',
              title: 'take',
              metadataStatus: 'fallback',
              presence: 'unknown',
            },
          ],
        },
      })

      const trackWrites = mocks.execute.mock.calls.filter(([query]) =>
        /INSERT\s+INTO\s+tracks/i.test(String(query)),
      )
      expect(trackWrites).toHaveLength(1)
      expect(mocks.convertFileSrc).not.toHaveBeenCalled()
    },
  )

  it('keeps a present Track when only tags are missing', async () => {
    arrangeSingleTrackMetadata('missing-tags')

    await expect(
      tauriFoundationGateway.chooseMusicFolder(),
    ).resolves.toMatchObject({
      kind: 'committed',
      snapshot: {
        access: 'granted',
        tracks: [
          {
            sourceIdentifier: 'take.wav',
            title: 'take',
            metadataStatus: 'fallback',
            presence: 'present',
          },
        ],
      },
    })

    const trackWrites = mocks.execute.mock.calls.filter(([query]) =>
      /INSERT\s+INTO\s+tracks/i.test(String(query)),
    )
    expect(trackWrites).toHaveLength(1)
    expect(trackWrites[0]?.[1]).toEqual(
      expect.arrayContaining(['take.wav', '/Synthetic Music/take.wav']),
    )
    expect(mocks.convertFileSrc).not.toHaveBeenCalled()
  })

  it('accepts invalid-tags as a known playable fallback when properties remain readable', async () => {
    arrangeSingleTrackMetadata('invalid-tags', 2_468)

    await expect(
      tauriFoundationGateway.chooseMusicFolder(),
    ).resolves.toMatchObject({
      kind: 'committed',
      snapshot: {
        access: 'granted',
        tracks: [
          {
            sourceIdentifier: 'take.wav',
            title: 'take',
            durationMs: 2_468,
            metadataStatus: 'fallback',
            presence: 'present',
          },
        ],
      },
    })

    const trackWrites = mocks.execute.mock.calls.filter(([query]) =>
      /INSERT\s+INTO\s+tracks/i.test(String(query)),
    )
    expect(trackWrites).toHaveLength(1)
    expect(trackWrites[0]?.[1]).toContain(2_468)
    expect(mocks.convertFileSrc).not.toHaveBeenCalled()
  })

  it('rejects an unknown metadata failure contract before writing', async () => {
    arrangeSingleTrackMetadata('future-unsafe-failure')

    await expect(
      tauriFoundationGateway.chooseMusicFolder(),
    ).rejects.toThrow('invalid failure kind')
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('rejects fallback metadata without a failure reason before writing', async () => {
    arrangeSingleTrackMetadata('missing-tags')
    mocks.invoke.mockResolvedValueOnce([
      {
        index: 0,
        title: 'take',
        artist: null,
        album: null,
        durationMs: null,
        status: 'fallback',
      },
    ])

    await expect(
      tauriFoundationGateway.chooseMusicFolder(),
    ).rejects.toThrow('fallback status without a failure kind')
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})
