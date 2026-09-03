import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type {
  LibrarySnapshot,
  LibraryTrack,
} from '../lib/library-ui-state'
import LibraryWorkspace from './LibraryWorkspace'

const absoluteFixturePath = '/fixture-music/session/fixture-take.mp3'

interface Story0006Marker {
  id: string
  trackId: string
  positionMs: number
  label: string | null
  body: string | null
  createdAt: string
  updatedAt: string
}

function createTrack(
  overrides: Partial<LibraryTrack> = {},
): LibraryTrack {
  return {
    id: 'track-fixture-a',
    musicFolderId: 'folder-fixture',
    source: 'local',
    sourceIdentifier: 'session/fixture-take.mp3',
    path: absoluteFixturePath,
    relativePath: 'session/fixture-take.mp3',
    fileName: 'fixture-take.mp3',
    format: 'mp3',
    title: 'Fixture Take',
    artist: 'Fixture Artist',
    album: 'Fixture Album',
    durationMs: 65_000,
    metadataStatus: 'tagged',
    presence: 'present',
    ...overrides,
  }
}

function createSnapshot(
  overrides: {
    access?: 'granted' | 'permission-required'
    completeness?: 'complete' | 'partial' | null
    issueCount?: number
    tracks?: LibraryTrack[]
  } = {},
): LibrarySnapshot {
  return {
    folder: {
      id: 'folder-fixture',
      rootPath: '/fixture-music',
      displayName: 'Fixture Music',
      selectedAt: '2026-09-02T00:00:00.000Z',
    },
    access: overrides.access ?? 'granted',
    tracks: overrides.tracks ?? [createTrack()],
    scan: {
      completeness: overrides.completeness ?? 'not-run',
      issues: Array.from(
        { length: overrides.issueCount ?? 0 },
        () => ({
          kind: 'directory-unreadable' as const,
          relativePath: 'fixture-unreadable',
        }),
      ),
    },
  }
}

function createGateway(snapshot: LibrarySnapshot | null) {
  return {
    loadLibrary: vi.fn().mockResolvedValue(snapshot),
    chooseMusicFolder: vi.fn().mockResolvedValue({ kind: 'cancelled' }),
    chooseMusicFiles: vi.fn().mockResolvedValue({ kind: 'cancelled' }),
    reconnectMusicFolder: vi.fn().mockResolvedValue({ kind: 'cancelled' }),
    toAudioUrl: vi.fn(
      (path: string) => `asset://localhost${encodeURIComponent(path)}`,
    ),
    loadMarkers: vi.fn().mockResolvedValue([] as Story0006Marker[]),
    createMarker: vi.fn(),
    updateMarker: vi.fn(),
    deleteMarker: vi.fn().mockResolvedValue(undefined),
    restoreMarker: vi.fn().mockImplementation(
      async (input: { id: string; trackId: string }) =>
        createMarker({ id: input.id, trackId: input.trackId }),
    ),
    loadPlayEvents: vi.fn().mockResolvedValue([]),
    startPlayEvent: vi.fn(),
    closePlayEvent: vi.fn(),
    loadTrackNotes: vi.fn().mockResolvedValue([]),
    loadListeningNotes: vi.fn().mockResolvedValue([]),
    createTrackNote: vi.fn(),
    createListeningNote: vi.fn(),
    updateTrackNote: vi.fn(),
    updateListeningNote: vi.fn(),
    deleteTrackNote: vi.fn().mockResolvedValue(undefined),
    deleteListeningNote: vi.fn().mockResolvedValue(undefined),
    restoreTrackNote: vi.fn(),
    restoreListeningNote: vi.fn(),
    searchNotes: vi.fn().mockResolvedValue([]),
  }
}

function createMarker(
  overrides: Partial<Story0006Marker> = {},
): Story0006Marker {
  return {
    id: 'marker-fixture',
    trackId: 'track-fixture-a',
    positionMs: 12_000,
    label: 'Fixture Marker',
    body: null,
    createdAt: '2026-09-02T04:00:00.000Z',
    updatedAt: '2026-09-02T04:00:00.000Z',
    ...overrides,
  }
}

describe('LibraryWorkspace', () => {
  it('offers explicit music files and folders as distinct scoped library sources', async () => {
    const user = userEvent.setup()
    const fileSnapshot = {
      ...createSnapshot({ completeness: 'complete' }),
      folder: {
        id: 'selected-files-fixture',
        rootPath: 'loupe-play:selected-files:v1',
        displayName: '選択した曲',
        selectedAt: '2026-09-02T13:00:00.000Z',
      },
    }
    const gateway = createGateway(null)
    gateway.chooseMusicFiles.mockResolvedValueOnce({
      kind: 'committed',
      snapshot: fileSnapshot,
    })

    render(<LibraryWorkspace gateway={gateway} />)

    const fileButton = await screen.findByRole('button', {
      name: '音楽ファイルを選ぶ',
    })
    const folderButton = screen.getByRole('button', {
      name: '音楽フォルダを選ぶ',
    })
    expect(fileButton).toHaveTextContent('曲を選ぶ')
    expect(fileButton.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      '♪',
    )
    expect(folderButton).toHaveTextContent('フォルダを選ぶ')
    expect(
      folderButton.querySelector('[aria-hidden="true"]'),
    ).toHaveTextContent('📁')

    await user.click(fileButton)

    expect(gateway.chooseMusicFiles).toHaveBeenCalledOnce()
    expect(gateway.chooseMusicFolder).not.toHaveBeenCalled()
    expect(
      await screen.findByRole('heading', { level: 4, name: '選択した曲' }),
    ).toHaveFocus()
  })

  it('invalidates search state after every committed library republication', async () => {
    const user = userEvent.setup()
    const gateway = createGateway(createSnapshot())
    gateway.chooseMusicFolder.mockResolvedValueOnce({
      kind: 'committed',
      snapshot: createSnapshot(),
    })
    render(<LibraryWorkspace gateway={gateway} />)

    const search = await screen.findByRole('searchbox', {
      name: '過去の耳を検索',
    })
    await user.type(search, '古い検索')
    await user.click(screen.getByRole('button', { name: '音楽フォルダを選ぶ' }))

    await waitFor(() =>
      expect(
        screen.getByRole('searchbox', { name: '過去の耳を検索' }),
      ).toHaveValue(''),
    )
  })

  it('opens a Marker search result on its Track and seeks only after metadata', async () => {
    const user = userEvent.setup()
    const destination = createTrack({
      id: 'track-fixture-b',
      sourceIdentifier: 'session/destination.flac',
      path: '/fixture-music/session/destination.flac',
      relativePath: 'session/destination.flac',
      fileName: 'destination.flac',
      format: 'flac',
      title: 'Destination',
      durationMs: 65_000,
    })
    const gateway = createGateway(
      createSnapshot({ tracks: [createTrack(), destination] }),
    )
    gateway.searchNotes.mockResolvedValueOnce([
      {
        id: 'marker-destination',
        kind: 'marker',
        trackId: destination.id,
        title: destination.title,
        artist: destination.artist,
        album: destination.album,
        excerpt: '終わり際のフィル',
        createdAt: '2026-09-02T12:00:00.000Z',
        positionMs: 80_000,
      },
    ])
    render(<LibraryWorkspace gateway={gateway} />)

    const search = await screen.findByRole('searchbox', {
      name: '過去の耳を検索',
    })
    await user.type(search, 'フィル')
    await user.click(screen.getByRole('button', { name: '検索' }))
    await user.click(
      await screen.findByRole('button', {
        name: 'Marker「Destination」80秒を開く',
      }),
    )

    expect(screen.getByRole('status', { name: '現在曲' })).toHaveTextContent(
      'Destination',
    )
    expect(screen.getByRole('button', { name: '再生' })).toHaveFocus()
    const media = screen.getByTestId('listen-audio') as HTMLAudioElement
    Object.defineProperty(media, 'duration', {
      configurable: true,
      value: 65,
    })
    Object.defineProperty(media, 'currentTime', {
      configurable: true,
      value: 0,
      writable: true,
    })
    fireEvent.loadedMetadata(media)
    expect(media.currentTime).toBe(65)
  })

  it('hydrates saved hierarchy as permission-required without exposing or resolving its absolute path', async () => {
    let resolveHydrate!: (snapshot: LibrarySnapshot) => void
    const savedSnapshot = createSnapshot({
      access: 'permission-required',
      tracks: [createTrack({ presence: 'unknown' })],
    })
    const gateway = createGateway(null)
    gateway.loadLibrary.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveHydrate = resolve
      }),
    )
    const { container } = render(<LibraryWorkspace gateway={gateway} />)

    expect(
      screen.getByRole('status', { name: 'ライブラリの状態' }),
    ).toHaveTextContent('読み込んでいます')
    expect(
      screen.getByRole('button', { name: '音楽フォルダを選ぶ' }),
    ).toBeDisabled()

    await act(async () => {
      resolveHydrate(savedSnapshot)
    })

    expect(
      await screen.findByRole('heading', {
        level: 4,
        name: 'Fixture Music',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 5, name: 'session' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: '音楽ライブラリ' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('status', { name: 'ライブラリの状態' }),
    ).toHaveTextContent('再接続が必要')
    expect(
      screen.getByRole('button', { name: /Fixture Take.*再接続が必要/ }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Fixture Music に再接続する' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: '別の音楽フォルダを選ぶ' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('region', { name: '保存済みの音源一覧' }),
    ).toHaveAttribute('tabindex', '0')
    expect(gateway.toAudioUrl).not.toHaveBeenCalled()
    expect(container.innerHTML).not.toContain(absoluteFixturePath)
  })

  it('enables explicit selection only after reconnecting the saved folder', async () => {
    const user = userEvent.setup()
    const savedSnapshot = createSnapshot({
      access: 'permission-required',
      tracks: [createTrack({ presence: 'unknown' })],
    })
    const reconnectedSnapshot = createSnapshot({
      access: 'granted',
      completeness: 'complete',
    })
    const gateway = createGateway(savedSnapshot)
    gateway.reconnectMusicFolder.mockResolvedValueOnce({
      kind: 'committed',
      snapshot: reconnectedSnapshot,
    })

    render(<LibraryWorkspace gateway={gateway} />)

    await user.click(
      await screen.findByRole('button', {
        name: 'Fixture Music に再接続する',
      }),
    )

    const trackButton = await screen.findByRole('button', {
      name: /Fixture Take.*選ぶ/,
    })
    expect(gateway.reconnectMusicFolder).toHaveBeenCalledWith('folder-fixture')
    expect(trackButton).toBeEnabled()
    expect(gateway.toAudioUrl).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          level: 4,
          name: 'Fixture Music',
        }),
      ).toHaveFocus(),
    )

    await user.click(trackButton)

    expect(gateway.toAudioUrl).toHaveBeenLastCalledWith(absoluteFixturePath)
    expect(
      screen.getByRole('region', {
        name: 'Fixture Take のListenプレイヤー',
      }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('listen-audio')).not.toHaveAttribute('controls')
    expect(screen.getByTitle('Fixture Take')).toBeInTheDocument()
    expect(
      screen.getByTitle('Fixture Artist · Fixture Album · 1:05'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /Fixture Take.*Fixture Artist.*Fixture Album.*1:05.*選択中/,
      }),
    ).toBeEnabled()
  })

  it('moves focus to the new library root after choosing a different folder', async () => {
    const user = userEvent.setup()
    const savedSnapshot = createSnapshot({
      access: 'permission-required',
      tracks: [createTrack({ presence: 'unknown' })],
    })
    const replacementSnapshot = {
      ...createSnapshot({
        access: 'granted',
        completeness: 'complete',
      }),
      folder: {
        id: 'folder-replacement',
        rootPath: '/fixture-replacement',
        displayName: 'Replacement Music',
        selectedAt: '2026-09-02T01:00:00.000Z',
      },
    }
    const gateway = createGateway(savedSnapshot)
    gateway.chooseMusicFolder.mockResolvedValueOnce({
      kind: 'committed',
      snapshot: replacementSnapshot,
    })

    render(<LibraryWorkspace gateway={gateway} />)

    await user.click(
      await screen.findByRole('button', {
        name: '別の音楽フォルダを選ぶ',
      }),
    )

    expect(gateway.chooseMusicFolder).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole('button', { name: '別の音楽フォルダを選ぶ' }),
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          level: 4,
          name: 'Replacement Music',
        }),
      ).toHaveFocus(),
    )
  })

  it('keeps the current hierarchy and player after cancellation and a sanitized failure', async () => {
    const user = userEvent.setup()
    const gateway = createGateway(createSnapshot())
    gateway.chooseMusicFolder
      .mockResolvedValueOnce({ kind: 'cancelled' })
      .mockRejectedValueOnce(
        new Error('/private/example/secret-library could not be read'),
      )
    const { container } = render(<LibraryWorkspace gateway={gateway} />)

    await user.click(
      await screen.findByRole('button', { name: /Fixture Take.*選ぶ/ }),
    )
    expect(
      screen.getByRole('region', {
        name: 'Fixture Take のListenプレイヤー',
      }),
    ).toBeInTheDocument()

    const chooseButton = screen.getByRole('button', {
      name: '音楽フォルダを選ぶ',
    })
    await user.click(chooseButton)
    await waitFor(() => expect(chooseButton).toBeEnabled())

    expect(
      screen.getByRole('heading', { name: 'Fixture Music' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', {
        name: 'Fixture Take のListenプレイヤー',
      }),
    ).toBeInTheDocument()

    await user.click(chooseButton)

    expect(
      await screen.findByRole('alert', { name: 'ライブラリ操作エラー' }),
    ).toHaveTextContent('保存済みライブラリを保持しました')
    expect(
      screen.getByRole('heading', { name: 'Fixture Music' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', {
        name: 'Fixture Take のListenプレイヤー',
      }),
    ).toBeInTheDocument()
    expect(container.innerHTML).not.toContain('/private/example')
    expect(container.innerHTML).not.toContain('secret-library')
  })

  it('shows a Track as unavailable and removes its player after a complete scan', async () => {
    const user = userEvent.setup()
    const track = createTrack()
    const gateway = createGateway(createSnapshot({ tracks: [track] }))
    gateway.chooseMusicFolder.mockResolvedValueOnce({
      kind: 'committed',
      snapshot: createSnapshot({
        completeness: 'complete',
        tracks: [createTrack({ presence: 'missing' })],
      }),
    })

    render(<LibraryWorkspace gateway={gateway} />)

    await user.click(
      await screen.findByRole('button', { name: /Fixture Take.*選ぶ/ }),
    )
    expect(
      screen.getByRole('region', {
        name: 'Fixture Take のListenプレイヤー',
      }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: '音楽フォルダを選ぶ' }),
    )

    expect(
      await screen.findByRole('status', { name: 'ライブラリの状態' }),
    ).toHaveTextContent('走査が完了しました')
    expect(
      screen.getByRole('button', { name: /Fixture Take.*利用不可/ }),
    ).toBeDisabled()
    expect(
      screen.queryByRole('region', {
        name: 'Fixture Take のListenプレイヤー',
      }),
    ).not.toBeInTheDocument()
  })

  it('moves through the playable visible queue without starting a paused selection', async () => {
    const user = userEvent.setup()
    const first = createTrack({
      id: 'track-first',
      sourceIdentifier: 'a-first.wav',
      path: '/fixture-music/a-first.wav',
      relativePath: 'a-first.wav',
      fileName: 'a-first.wav',
      format: 'wav',
      title: 'First',
    })
    const unavailable = createTrack({
      id: 'track-missing',
      sourceIdentifier: 'b-missing.mp3',
      path: '/fixture-music/b-missing.mp3',
      relativePath: 'b-missing.mp3',
      fileName: 'b-missing.mp3',
      title: 'Missing',
      presence: 'missing',
    })
    const next = createTrack({
      id: 'track-next',
      sourceIdentifier: 'Folder/c-next.flac',
      path: '/fixture-music/Folder/c-next.flac',
      relativePath: 'Folder/c-next.flac',
      fileName: 'c-next.flac',
      format: 'flac',
      title: 'Next',
    })
    const gateway = createGateway(
      createSnapshot({ tracks: [next, unavailable, first] }),
    )

    render(<LibraryWorkspace gateway={gateway} />)
    await user.click(
      await screen.findByRole('button', { name: /First.*選ぶ/ }),
    )

    expect(screen.getByRole('button', { name: '前の曲' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.click(screen.getByRole('button', { name: '次の曲' }))

    expect(screen.getByRole('status', { name: '現在曲' })).toHaveTextContent(
      'Next',
    )
    expect(
      screen.getByRole('button', { name: /Missing.*利用不可/ }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: '次の曲' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    const nextMedia = screen.getByTestId('listen-audio')
    const play = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(nextMedia, 'play', {
      configurable: true,
      value: play,
    })
    fireEvent.canPlay(nextMedia)

    expect(play).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '再生' })).toBeInTheDocument()
  })

  it('continues a playing intent after manual next becomes ready', async () => {
    const user = userEvent.setup()
    const first = createTrack({
      id: 'track-first',
      sourceIdentifier: 'first.wav',
      path: '/fixture-music/first.wav',
      relativePath: 'first.wav',
      fileName: 'first.wav',
      format: 'wav',
      title: 'First',
    })
    const second = createTrack({
      id: 'track-second',
      sourceIdentifier: 'second.flac',
      path: '/fixture-music/second.flac',
      relativePath: 'second.flac',
      fileName: 'second.flac',
      format: 'flac',
      title: 'Second',
    })
    const gateway = createGateway(createSnapshot({ tracks: [second, first] }))

    render(<LibraryWorkspace gateway={gateway} />)
    await user.click(
      await screen.findByRole('button', { name: /First.*選ぶ/ }),
    )
    const firstMedia = screen.getByTestId('listen-audio')
    Object.defineProperty(firstMedia, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    fireEvent.canPlay(firstMedia)
    await user.click(screen.getByRole('button', { name: '再生' }))

    const nextButton = screen.getByRole('button', { name: '次の曲' })
    await user.click(nextButton)
    const secondMedia = screen.getByTestId('listen-audio')
    expect(secondMedia).not.toBe(firstMedia)
    const continuePlay = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(secondMedia, 'play', {
      configurable: true,
      value: continuePlay,
    })
    fireEvent.canPlay(secondMedia)

    await waitFor(() => expect(continuePlay).toHaveBeenCalledOnce())
    expect(nextButton).toHaveFocus()
    expect(screen.getByRole('status', { name: '現在曲' })).toHaveTextContent(
      'Second',
    )
  })

  it('switches modes without resolving the selected Track again', async () => {
    const user = userEvent.setup()
    const gateway = createGateway(createSnapshot())

    render(<LibraryWorkspace gateway={gateway} />)
    await user.click(
      await screen.findByRole('button', { name: /Fixture Take.*選ぶ/ }),
    )
    const media = screen.getByTestId('listen-audio')
    const source = media.getAttribute('src')
    expect(gateway.toAudioUrl).toHaveBeenCalledOnce()

    const modeButton = screen.getByRole('button', {
      name: 'Practiceへ切り替える',
    })
    await user.click(modeButton)

    expect(screen.getByTestId('listen-audio')).toBe(media)
    expect(screen.getByTestId('listen-audio')).toHaveAttribute('src', source)
    expect(gateway.toAudioUrl).toHaveBeenCalledOnce()
    expect(modeButton).toHaveFocus()
    expect(
      screen.getByRole('region', {
        name: 'Fixture Take のPracticeプレイヤー',
      }),
    ).toBeInTheDocument()
  })

  it('passes the canonical Track identity to Marker and isolates a late previous-Track load', async () => {
    const user = userEvent.setup()
    const first = createTrack({
      id: 'track-first',
      sourceIdentifier: 'first.wav',
      path: '/fixture-music/first.wav',
      relativePath: 'first.wav',
      fileName: 'first.wav',
      format: 'wav',
      title: 'First',
    })
    const second = createTrack({
      id: 'track-second',
      sourceIdentifier: 'second.flac',
      path: '/fixture-music/second.flac',
      relativePath: 'second.flac',
      fileName: 'second.flac',
      format: 'flac',
      title: 'Second',
    })
    let rejectFirstLoad!: (reason?: unknown) => void
    const firstLoad = new Promise<Story0006Marker[]>((_resolve, reject) => {
      rejectFirstLoad = reject
    })
    const gateway = createGateway(
      createSnapshot({ tracks: [second, first] }),
    )
    gateway.loadMarkers.mockImplementation((trackId: string) => {
      if (trackId === 'track-first') {
        return firstLoad
      }

      return Promise.resolve([
        createMarker({
          id: 'marker-second',
          trackId: 'track-second',
          label: '現在TrackのMarker',
        }),
      ])
    })

    render(<LibraryWorkspace gateway={gateway} />)
    await user.click(
      await screen.findByRole('button', { name: /First.*選ぶ/ }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )
    expect(gateway.loadMarkers).toHaveBeenCalledWith('track-first')

    await user.click(screen.getByRole('button', { name: /Second.*選ぶ/ }))

    expect(gateway.loadMarkers).toHaveBeenCalledWith('track-second')
    expect(await screen.findByText('現在TrackのMarker')).toBeInTheDocument()
    expect(
      screen.getByRole('region', {
        name: 'Second のPracticeプレイヤー',
      }),
    ).toBeInTheDocument()

    await act(async () => {
      rejectFirstLoad(
        new Error('/private/first.wav: SELECT * FROM markers failed'),
      )
      await firstLoad.catch(() => undefined)
    })

    expect(screen.getByText('現在TrackのMarker')).toBeInTheDocument()
    expect(screen.queryByRole('alert', { name: 'Marker読込エラー' })).toBeNull()
    expect(document.body.textContent).not.toContain('/private/first.wav')
    expect(document.body.textContent).not.toContain('SELECT *')
  })

  it('advances once on ended and stops without wrapping at the queue end', async () => {
    const user = userEvent.setup()
    const first = createTrack({
      id: 'track-first',
      sourceIdentifier: 'first.wav',
      path: '/fixture-music/first.wav',
      relativePath: 'first.wav',
      fileName: 'first.wav',
      format: 'wav',
      title: 'First',
    })
    const last = createTrack({
      id: 'track-last',
      sourceIdentifier: 'last.mp3',
      path: '/fixture-music/last.mp3',
      relativePath: 'last.mp3',
      fileName: 'last.mp3',
      title: 'Last',
    })
    const gateway = createGateway(createSnapshot({ tracks: [last, first] }))

    render(<LibraryWorkspace gateway={gateway} />)
    await user.click(
      await screen.findByRole('button', { name: /First.*選ぶ/ }),
    )
    const firstMedia = screen.getByTestId('listen-audio')
    fireEvent.ended(firstMedia)
    fireEvent.ended(firstMedia)

    expect(screen.getByRole('status', { name: '現在曲' })).toHaveTextContent(
      'Last',
    )
    const lastMedia = screen.getByTestId('listen-audio')
    const play = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(lastMedia, 'play', {
      configurable: true,
      value: play,
    })
    fireEvent.canPlay(lastMedia)
    await waitFor(() => expect(play).toHaveBeenCalledOnce())

    fireEvent.ended(lastMedia)

    expect(screen.getByRole('status', { name: '現在曲' })).toHaveTextContent(
      'Last',
    )
    expect(screen.getByRole('button', { name: '次の曲' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(gateway.toAudioUrl).toHaveBeenCalledTimes(2)
  })

  it('retains an unseen Track as unknown after a partial scan', async () => {
    const user = userEvent.setup()
    const visibleTrack = createTrack()
    const unseenTrack = createTrack({
      id: 'track-fixture-b',
      sourceIdentifier: 'locked/second-take.flac',
      path: '/fixture-music/locked/second-take.flac',
      relativePath: 'locked/second-take.flac',
      fileName: 'second-take.flac',
      format: 'flac',
      title: 'Second Take',
    })
    const gateway = createGateway(
      createSnapshot({ tracks: [visibleTrack, unseenTrack] }),
    )
    gateway.chooseMusicFolder.mockResolvedValueOnce({
      kind: 'committed',
      snapshot: createSnapshot({
        completeness: 'partial',
        issueCount: 1,
        tracks: [visibleTrack, { ...unseenTrack, presence: 'unknown' }],
      }),
    })

    render(<LibraryWorkspace gateway={gateway} />)

    await user.click(
      await screen.findByRole('button', { name: '音楽フォルダを選ぶ' }),
    )

    expect(
      await screen.findByRole('status', { name: 'ライブラリの状態' }),
    ).toHaveTextContent('一部を確認できませんでした')
    expect(
      screen.getByRole('button', { name: /Second Take.*確認できません/ }),
    ).toBeDisabled()
    expect(screen.queryByText('利用不可')).not.toBeInTheDocument()
    expect(gateway.toAudioUrl).not.toHaveBeenCalled()
  })

  it('keeps deep folder semantics while capping visual indentation', async () => {
    const gateway = createGateway(
      createSnapshot({
        tracks: [
          createTrack({
            sourceIdentifier: 'one/two/three/four/five/take.mp3',
            relativePath: 'one/two/three/four/five/take.mp3',
          }),
        ],
      }),
    )

    render(<LibraryWorkspace gateway={gateway} />)

    expect(
      await screen.findByRole('heading', { name: 'one' }),
    ).toHaveAttribute('aria-level', '5')
    expect(screen.getByRole('heading', { name: 'two' })).toHaveAttribute(
      'aria-level',
      '6',
    )
    expect(screen.getByRole('heading', { name: 'three' })).toHaveAttribute(
      'aria-level',
      '7',
    )
    expect(
      screen.getByRole('heading', { name: 'four' }).closest('li'),
    ).toHaveAttribute('data-indent', 'capped')
  })
})
