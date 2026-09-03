import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { LibraryTrack } from '../lib/library-ui-state'
import type { PlayEventRepository } from '../lib/play-event-repository'
import ListenPlayer, {
  type ListenPlaybackRequest,
} from './ListenPlayer'

interface Story0006Marker {
  id: string
  trackId: string
  positionMs: number
  label: string | null
  body: string | null
  createdAt: string
  updatedAt: string
}

interface Story0006MarkerGateway {
  loadMarkers: (trackId: string) => Promise<Story0006Marker[]>
  createMarker: (input: {
    trackId: string
    positionMs: number
    label: string | null
    body: string | null
  }) => Promise<Story0006Marker>
  updateMarker: (input: {
    id: string
    trackId: string
    positionMs: number
    label: string | null
    body: string | null
  }) => Promise<Story0006Marker>
  deleteMarker: (input: { id: string; trackId: string }) => Promise<void>
  restoreMarker: (
    input: { id: string; trackId: string },
  ) => Promise<Story0006Marker>
}

type Story0006ListenPlayerProps = React.ComponentProps<typeof ListenPlayer> & {
  markerGateway: Story0006MarkerGateway
}

const Story0006ListenPlayer =
  ListenPlayer as React.ComponentType<Story0006ListenPlayerProps>

type Story0009ListenPlayerProps = React.ComponentProps<typeof ListenPlayer> & {
  historyGateway: PlayEventRepository
}

const Story0009ListenPlayer =
  ListenPlayer as React.ComponentType<Story0009ListenPlayerProps>

interface Story0008SeekRequest {
  id: number
  trackId: string
  positionMs: number
}

type Story0008ListenPlayerProps = React.ComponentProps<typeof ListenPlayer> & {
  seekRequest: Story0008SeekRequest | null
}

const Story0008ListenPlayer =
  ListenPlayer as React.ComponentType<Story0008ListenPlayerProps>

function createTrack(
  overrides: Partial<LibraryTrack> = {},
): LibraryTrack {
  return {
    id: 'track-one',
    musicFolderId: 'folder-fixture',
    source: 'local',
    sourceIdentifier: 'Session/fixture-song.mp3',
    path: '/private/fixture-root/Session/fixture-song.mp3',
    relativePath: 'Session/fixture-song.mp3',
    fileName: 'fixture-song.mp3',
    format: 'mp3',
    title: 'Fixture Song',
    artist: 'Fixture Artist',
    album: 'Fixture Album',
    durationMs: 125_000,
    metadataStatus: 'tagged',
    presence: 'present',
    ...overrides,
  }
}

function pausedRequest(
  id = 1,
  focusPlayback = true,
): ListenPlaybackRequest {
  return { id, intent: 'pause', focusPlayback }
}

function createProps(
  overrides: Partial<React.ComponentProps<typeof ListenPlayer>> = {},
): React.ComponentProps<typeof ListenPlayer> {
  return {
    track: createTrack(),
    sourceUrl: 'asset://fixture/fixture-song.mp3',
    playbackRequest: pausedRequest(),
    hasPrevious: false,
    hasNext: true,
    onMove: vi.fn(),
    onEnded: vi.fn(),
    ...overrides,
  }
}

function createMarkerGateway(
  markers: Story0006Marker[] = [],
): Story0006MarkerGateway {
  return {
    loadMarkers: vi.fn().mockResolvedValue(markers),
    createMarker: vi.fn().mockImplementation(async (input) => ({
      id: 'marker-created',
      trackId: input.trackId,
      positionMs: input.positionMs,
      label: input.label,
      body: input.body,
      createdAt: '2026-09-02T03:00:00.000Z',
      updatedAt: '2026-09-02T03:00:00.000Z',
    })),
    updateMarker: vi.fn(),
    deleteMarker: vi.fn().mockResolvedValue(undefined),
    restoreMarker: vi.fn().mockImplementation(async (input) =>
      markers.find((marker) => marker.id === input.id) ??
      createMarker({ id: input.id, trackId: input.trackId }),
    ),
  }
}

function createMarker(
  overrides: Partial<Story0006Marker> = {},
): Story0006Marker {
  return {
    id: 'marker-one',
    trackId: 'track-one',
    positionMs: 36_500,
    label: 'フィル',
    body: null,
    createdAt: '2026-09-02T03:00:00.000Z',
    updatedAt: '2026-09-02T03:00:00.000Z',
    ...overrides,
  }
}

function createHistoryGateway(): PlayEventRepository {
  let sequence = 0
  return {
    loadPlayEvents: vi.fn().mockResolvedValue([]),
    startPlayEvent: vi.fn().mockImplementation(async (input) => ({
      id: `event-${++sequence}`,
      trackId: input.trackId,
      startedAt: '2026-09-02T10:00:00.000Z',
      endedAt: null,
      startPositionMs: input.startPositionMs,
      endPositionMs: null,
      mode: input.mode,
      playbackRate: input.playbackRate,
      loopStartMs: input.loopStartMs,
      loopEndMs: input.loopEndMs,
      closedReason: null,
      recoveredAt: null,
    })),
    closePlayEvent: vi.fn().mockImplementation(async (input) => ({
      id: input.id,
      trackId: input.trackId,
      startedAt: '2026-09-02T10:00:00.000Z',
      endedAt: '2026-09-02T10:01:00.000Z',
      startPositionMs: 0,
      endPositionMs: input.endPositionMs,
      mode: 'listen' as const,
      playbackRate: 1,
      loopStartMs: null,
      loopEndMs: null,
      closedReason: input.reason,
      recoveredAt: null,
    })),
  }
}

function mediaElement(): HTMLAudioElement {
  return screen.getByTestId('listen-audio') as HTMLAudioElement
}

function prepareMedia(
  media: HTMLAudioElement,
  values: { duration?: number; currentTime?: number } = {},
) {
  Object.defineProperty(media, 'duration', {
    configurable: true,
    value: values.duration ?? 125,
  })
  Object.defineProperty(media, 'currentTime', {
    configurable: true,
    value: values.currentTime ?? 12,
    writable: true,
  })
}

describe('ListenPlayer', () => {
  it('applies one matching Marker seek after metadata and clamps it to duration', () => {
    const seekRequest = {
      id: 1,
      trackId: 'track-one',
      positionMs: 200_000,
    }
    const { rerender } = render(
      <Story0008ListenPlayer
        {...createProps()}
        seekRequest={seekRequest}
      />,
    )
    const media = mediaElement()
    prepareMedia(media, { duration: 125, currentTime: 0 })

    fireEvent.loadedMetadata(media)
    expect(media.currentTime).toBe(125)
    expect(screen.getByLabelText('再生時刻')).toHaveTextContent(
      '2:05 / 2:05',
    )

    media.currentTime = 30
    fireEvent.durationChange(media)
    expect(media.currentTime).toBe(30)

    rerender(
      <Story0008ListenPlayer
        {...createProps()}
        seekRequest={seekRequest}
      />,
    )
    fireEvent.loadedMetadata(media)
    expect(media.currentTime).toBe(30)
  })

  it('does not apply a stale Marker seek owned by another Track', () => {
    render(
      <Story0008ListenPlayer
        {...createProps()}
        seekRequest={{ id: 2, trackId: 'track-two', positionMs: 42_000 }}
      />,
    )
    const media = mediaElement()
    prepareMedia(media, { duration: 125, currentTime: 7 })

    fireEvent.loadedMetadata(media)

    expect(media.currentTime).toBe(7)
  })

  it('shows current Track metadata and one custom Listen surface', async () => {
    render(<ListenPlayer {...createProps()} />)

    expect(
      screen.getByRole('region', { name: 'Fixture Song のListenプレイヤー' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '現在曲' })).toHaveTextContent(
      'Fixture Song',
    )
    expect(screen.getByText('Fixture Artist')).toBeInTheDocument()
    expect(screen.getByText('Fixture Album')).toBeInTheDocument()
    expect(screen.getByLabelText('再生時刻')).toHaveTextContent(
      '0:00 / --:--',
    )
    expect(screen.getByRole('button', { name: '前の曲' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: '再生' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: '次の曲' })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
    expect(screen.getByRole('slider', { name: '再生位置' })).toBeDisabled()
    expect(screen.getByRole('slider', { name: '音量' })).toHaveValue('1')
    expect(
      screen
        .getByRole('slider', { name: '再生位置' })
        .compareDocumentPosition(
          screen.getByRole('group', { name: 'Listen再生操作' }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
    expect(mediaElement()).not.toHaveAttribute('controls')
    expect(mediaElement()).toHaveAttribute('aria-hidden', 'true')
    expect(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    ).not.toHaveAttribute('aria-pressed')
    expect(screen.queryByRole('button', { name: /5秒/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '再生速度' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'A-Bループ' })).not.toBeInTheDocument()
    expect(screen.queryByRole('note', { name: 'ループ診断値' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('/private/fixture-root')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '再生' })).toHaveFocus(),
    )
  })

  it('connects play, pause, seek, and volume to the media element', async () => {
    const user = userEvent.setup()
    render(<ListenPlayer {...createProps()} />)
    const media = mediaElement()
    prepareMedia(media)
    const play = vi.fn().mockResolvedValue(undefined)
    const pause = vi.fn()
    Object.defineProperty(media, 'play', { configurable: true, value: play })
    Object.defineProperty(media, 'pause', { configurable: true, value: pause })
    fireEvent.loadedMetadata(media)
    fireEvent.canPlay(media)

    expect(screen.getByRole('button', { name: '再生' })).toHaveAttribute(
      'aria-disabled',
      'false',
    )

    const timeReadout = screen.getByLabelText('再生時刻')
    expect(timeReadout).toHaveTextContent('0:12 / 2:05')
    expect(
      timeReadout.querySelector('.listen-time-current'),
    ).toHaveTextContent('0:12')
    expect(
      timeReadout.querySelector('.listen-time-duration'),
    ).toHaveTextContent('2:05')
    expect(screen.getByRole('slider', { name: '再生位置' })).toHaveAttribute(
      'aria-valuetext',
      '0:12 / 2:05',
    )

    const previous = screen.getByRole('button', { name: '前の曲' })
    const playButton = screen.getByRole('button', { name: '再生' })
    const next = screen.getByRole('button', { name: '次の曲' })
    expect(previous.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      '⏮',
    )
    expect(playButton.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      '▶',
    )
    expect(next.querySelector('[aria-hidden="true"]')).toHaveTextContent('⏭')

    await user.click(playButton)
    expect(play).toHaveBeenCalledOnce()
    const pauseButton = await screen.findByRole('button', { name: '一時停止' })
    expect(pauseButton.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      '⏸',
    )

    fireEvent.change(screen.getByRole('slider', { name: '再生位置' }), {
      target: { value: '64.25' },
    })
    expect(media.currentTime).toBe(64.25)

    fireEvent.change(screen.getByRole('slider', { name: '音量' }), {
      target: { value: '0.42' },
    })
    expect(media.volume).toBe(0.42)
    expect(screen.getByText('42%')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '一時停止' }))
    expect(pause).toHaveBeenCalledOnce()
  })

  it('preserves volume while replacing only the media source and auto-plays once when ready', async () => {
    const user = userEvent.setup()
    const firstProps = createProps()
    const { rerender } = render(<ListenPlayer {...firstProps} />)
    const firstMedia = mediaElement()
    prepareMedia(firstMedia)
    fireEvent.loadedMetadata(firstMedia)
    fireEvent.canPlay(firstMedia)
    fireEvent.change(screen.getByRole('slider', { name: '音量' }), {
      target: { value: '0.36' },
    })
    fireEvent.error(firstMedia)
    expect(
      screen.getByRole('alert', { name: '音源の読み込みエラー' }),
    ).toBeInTheDocument()

    const nextButton = screen.getByRole('button', { name: '次の曲' })
    await user.click(nextButton)
    expect(nextButton).toHaveFocus()

    rerender(
      <ListenPlayer
        {...createProps({
          track: createTrack({
            id: 'track-two',
            path: '/private/fixture-root/Session/next.flac',
            relativePath: 'Session/next.flac',
            fileName: 'next.flac',
            title: 'Next Fixture',
            format: 'flac',
          }),
          sourceUrl: 'asset://fixture/next.flac',
          playbackRequest: {
            id: 2,
            intent: 'play',
            focusPlayback: false,
          },
        })}
      />,
    )

    const secondMedia = mediaElement()
    expect(secondMedia).not.toBe(firstMedia)
    expect(secondMedia.volume).toBe(0.36)
    expect(screen.getByLabelText('再生時刻')).toHaveTextContent(
      '0:00 / --:--',
    )
    expect(
      screen.queryByRole('alert', { name: '音源の読み込みエラー' }),
    ).not.toBeInTheDocument()
    expect(nextButton).toHaveFocus()

    const play = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(secondMedia, 'play', {
      configurable: true,
      value: play,
    })
    fireEvent.canPlay(secondMedia)
    fireEvent.canPlay(secondMedia)

    await waitFor(() => expect(play).toHaveBeenCalledOnce())
    expect(
      await screen.findByRole('button', { name: '一時停止' }),
    ).toBeInTheDocument()
  })

  it('passes the current playback intent to manual previous and next requests', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(
      <ListenPlayer
        {...createProps({ hasPrevious: true, onMove })}
      />,
    )

    await user.click(screen.getByRole('button', { name: '次の曲' }))
    expect(onMove).toHaveBeenLastCalledWith('next', false)

    const media = mediaElement()
    prepareMedia(media)
    Object.defineProperty(media, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    fireEvent.canPlay(media)
    await user.click(screen.getByRole('button', { name: '再生' }))

    await user.click(screen.getByRole('button', { name: '前の曲' }))
    expect(onMove).toHaveBeenLastCalledWith('previous', true)
  })

  it('keeps a pending play request when the user moves before it resolves', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<ListenPlayer {...createProps({ onMove })} />)
    const media = mediaElement()
    prepareMedia(media)
    Object.defineProperty(media, 'play', {
      configurable: true,
      value: vi.fn().mockReturnValue(new Promise<void>(() => undefined)),
    })
    fireEvent.canPlay(media)

    await user.click(screen.getByRole('button', { name: '再生' }))
    await user.click(screen.getByRole('button', { name: '次の曲' }))

    expect(onMove).toHaveBeenLastCalledWith('next', true)
  })

  it('keeps an inherited play request while the next source is loading', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(
      <ListenPlayer
        {...createProps({
          playbackRequest: {
            id: 2,
            intent: 'play',
            focusPlayback: false,
          },
          onMove,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: '次の曲' }))

    expect(onMove).toHaveBeenLastCalledWith('next', true)
  })

  it('keeps a pause request when moving before the pause event arrives', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<ListenPlayer {...createProps({ onMove })} />)
    const media = mediaElement()
    prepareMedia(media)
    Object.defineProperty(media, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    Object.defineProperty(media, 'pause', {
      configurable: true,
      value: vi.fn(),
    })
    fireEvent.canPlay(media)
    await user.click(screen.getByRole('button', { name: '再生' }))

    await user.click(screen.getByRole('button', { name: '一時停止' }))
    await user.click(screen.getByRole('button', { name: '次の曲' }))

    expect(onMove).toHaveBeenLastCalledWith('next', false)
  })

  it('handles ended once per source and ignores events from a replaced element', () => {
    const onEnded = vi.fn()
    const { rerender } = render(
      <ListenPlayer {...createProps({ onEnded })} />,
    )
    const firstMedia = mediaElement()

    fireEvent.ended(firstMedia)
    fireEvent.ended(firstMedia)
    expect(onEnded).toHaveBeenCalledOnce()

    rerender(
      <ListenPlayer
        {...createProps({
          track: createTrack({ id: 'track-two', title: 'Next Fixture' }),
          sourceUrl: 'asset://fixture/next.flac',
          playbackRequest: pausedRequest(2, false),
          onEnded,
        })}
      />,
    )

    fireEvent.ended(firstMedia)
    expect(onEnded).toHaveBeenCalledOnce()
    fireEvent.ended(mediaElement())
    expect(onEnded).toHaveBeenCalledTimes(2)
  })

  it('sanitizes play and load failures and retries the current source at the same volume', async () => {
    const user = userEvent.setup()
    render(<ListenPlayer {...createProps()} />)
    const media = mediaElement()
    prepareMedia(media)
    const load = vi.fn()
    Object.defineProperty(media, 'load', { configurable: true, value: load })
    Object.defineProperty(media, 'play', {
      configurable: true,
      value: vi.fn().mockRejectedValue(
        new DOMException('/private/fixture-root/secret.mp3', 'NotAllowedError'),
      ),
    })
    fireEvent.canPlay(media)

    await act(async () => {
      await user.click(screen.getByRole('button', { name: '再生' }))
    })
    expect(screen.getByRole('alert', { name: '再生エラー' })).toHaveTextContent(
      '再生を始められませんでした',
    )
    expect(document.body.textContent).not.toContain('/private/fixture-root')

    fireEvent.change(screen.getByRole('slider', { name: '音量' }), {
      target: { value: '0.55' },
    })
    fireEvent.error(media)
    const retryButton = screen.getByRole('button', {
      name: '音源を再読み込み',
    })
    await user.click(retryButton)

    expect(load).toHaveBeenCalledOnce()
    expect(media.volume).toBe(0.55)
    expect(retryButton).toHaveFocus()
    expect(retryButton).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(/読み込み直しています/)).toBeInTheDocument()
  })

  it('keeps load recovery available when a pending play rejects afterward', async () => {
    const user = userEvent.setup()
    let rejectPlay!: (reason: unknown) => void
    const pendingPlay = new Promise<void>((_resolve, reject) => {
      rejectPlay = reject
    })
    render(<ListenPlayer {...createProps()} />)
    const media = mediaElement()
    prepareMedia(media)
    Object.defineProperty(media, 'play', {
      configurable: true,
      value: vi.fn().mockReturnValue(pendingPlay),
    })
    fireEvent.canPlay(media)

    await user.click(screen.getByRole('button', { name: '再生' }))
    fireEvent.error(media)
    expect(
      screen.getByRole('button', { name: '音源を再読み込み' }),
    ).toBeInTheDocument()

    await act(async () => {
      rejectPlay(new DOMException('aborted', 'AbortError'))
      await pendingPlay.catch(() => undefined)
    })

    expect(
      screen.getByRole('button', { name: '音源を再読み込み' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('alert', { name: '音源の読み込みエラー' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert', { name: '再生エラー' })).toBeNull()
  })

  it('ignores a play rejection from before a successful retry', async () => {
    const user = userEvent.setup()
    let rejectPlay!: (reason: unknown) => void
    const pendingPlay = new Promise<void>((_resolve, reject) => {
      rejectPlay = reject
    })
    render(<ListenPlayer {...createProps()} />)
    const media = mediaElement()
    prepareMedia(media)
    Object.defineProperty(media, 'play', {
      configurable: true,
      value: vi.fn().mockReturnValue(pendingPlay),
    })
    Object.defineProperty(media, 'load', {
      configurable: true,
      value: vi.fn(),
    })
    fireEvent.canPlay(media)
    await user.click(screen.getByRole('button', { name: '再生' }))
    fireEvent.error(media)

    await user.click(
      screen.getByRole('button', { name: '音源を再読み込み' }),
    )
    fireEvent.canPlay(media)
    expect(screen.getByText('Fixture Song を再生できます。')).toBeInTheDocument()

    await act(async () => {
      rejectPlay(new DOMException('aborted', 'AbortError'))
      await pendingPlay.catch(() => undefined)
    })

    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      screen.queryByRole('button', { name: '音源を再読み込み' }),
    ).toBeNull()
    expect(screen.getByText('Fixture Song を再生できます。')).toBeInTheDocument()
  })

  it('opens Practice without replacing or controlling the current media', async () => {
    const user = userEvent.setup()
    render(<ListenPlayer {...createProps()} />)
    const media = mediaElement()
    prepareMedia(media, { currentTime: 41.25 })
    const play = vi.fn().mockResolvedValue(undefined)
    const pause = vi.fn()
    const load = vi.fn()
    Object.defineProperty(media, 'play', { configurable: true, value: play })
    Object.defineProperty(media, 'pause', { configurable: true, value: pause })
    Object.defineProperty(media, 'load', { configurable: true, value: load })
    fireEvent.loadedMetadata(media)
    fireEvent.canPlay(media)
    await user.click(screen.getByRole('button', { name: '再生' }))
    fireEvent.change(screen.getByRole('slider', { name: '音量' }), {
      target: { value: '0.4' },
    })

    const modeButton = screen.getByRole('button', {
      name: 'Practiceへ切り替える',
    })
    await user.click(modeButton)

    expect(mediaElement()).toBe(media)
    expect(media.currentTime).toBe(41.25)
    expect(media.volume).toBe(0.4)
    expect(play).toHaveBeenCalledOnce()
    expect(pause).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
    expect(modeButton).toHaveFocus()
    expect(modeButton).toHaveAccessibleName('Listenへ戻る')
    expect(
      screen.getByRole('region', {
        name: 'Fixture Song のPracticeプレイヤー',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('group', { name: 'Practice再生操作' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '一時停止' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5秒戻る' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5秒進む' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '再生速度' })).toHaveValue('1')
    expect(media).not.toHaveAttribute('controls')
  })

  it('keeps a pending play request in the same session across a mode switch', async () => {
    const user = userEvent.setup()
    let resolvePlay!: () => void
    const pendingPlay = new Promise<void>((resolve) => {
      resolvePlay = resolve
    })
    render(<ListenPlayer {...createProps()} />)
    const media = mediaElement()
    prepareMedia(media)
    Object.defineProperty(media, 'play', {
      configurable: true,
      value: vi.fn().mockReturnValue(pendingPlay),
    })
    fireEvent.canPlay(media)

    await user.click(screen.getByRole('button', { name: '再生' }))
    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )
    await act(async () => {
      resolvePlay()
      await pendingPlay
    })

    expect(mediaElement()).toBe(media)
    expect(screen.getByRole('button', { name: '一時停止' })).toBeInTheDocument()
    expect(
      screen.getByRole('region', {
        name: 'Fixture Song のPracticeプレイヤー',
      }),
    ).toBeInTheDocument()
  })

  it('applies Practice seeking, pitch-preserving rate, and A-B loop controls', async () => {
    const user = userEvent.setup()
    render(<ListenPlayer {...createProps()} />)
    const media = mediaElement()
    prepareMedia(media, { duration: 10, currentTime: 2 })
    const writes: string[] = []
    Object.defineProperty(media, 'preservesPitch', {
      configurable: true,
      get: () => false,
      set: (value: boolean) => writes.push(`pitch:${value}`),
    })
    Object.defineProperty(media, 'playbackRate', {
      configurable: true,
      get: () => 1,
      set: (value: number) => writes.push(`rate:${value}`),
    })
    Object.defineProperty(media, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    fireEvent.loadedMetadata(media)
    fireEvent.canPlay(media)
    await user.click(screen.getByRole('button', { name: '再生' }))
    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )

    await user.click(screen.getByRole('button', { name: '5秒戻る' }))
    expect(media.currentTime).toBe(0)
    await user.click(screen.getByRole('button', { name: '5秒進む' }))
    expect(media.currentTime).toBe(5)
    await user.selectOptions(
      screen.getByRole('combobox', { name: '再生速度' }),
      '0.8',
    )
    expect(writes).toEqual(['pitch:true', 'rate:0.8'])

    await user.click(screen.getByRole('button', { name: 'A地点を設定' }))
    expect(screen.getByText('A 0:05.00')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: '再生位置' }), {
      target: { value: '8' },
    })
    await user.click(screen.getByRole('button', { name: 'B地点を設定' }))
    expect(screen.getByText('B 0:08.00')).toBeInTheDocument()

    const loopButton = screen.getByRole('button', {
      name: 'A-Bループを開始',
    })
    await user.click(loopButton)
    expect(loopButton).toHaveAttribute('aria-pressed', 'true')
    expect(loopButton).toHaveAccessibleName('A-Bループを停止')

    media.currentTime = 8.037
    fireEvent.timeUpdate(media)
    expect(media.currentTime).toBe(5)
    fireEvent.seeking(media)
    media.currentTime = 5.011
    fireEvent.seeked(media)
    expect(screen.getByRole('note', { name: 'ループ診断値' })).toHaveTextContent(
      '周回 1',
    )
    expect(screen.getByRole('note', { name: 'ループ診断値' })).toHaveTextContent(
      '境界超過 37 ms',
    )
    expect(screen.getByRole('note', { name: 'ループ診断値' })).toHaveTextContent(
      '着地点誤差 11 ms',
    )

    await user.click(screen.getByRole('button', { name: 'A-Bをクリア' }))
    expect(screen.getByText('A —')).toBeInTheDocument()
    expect(screen.getByText('B —')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'A-Bループを開始' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('returns to Listen safely and ignores a queued Practice frame', async () => {
    const user = userEvent.setup()
    const frameCallbacks: FrameRequestCallback[] = []
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })
    const cancelFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelFrame)
    render(<ListenPlayer {...createProps()} />)
    const media = mediaElement()
    prepareMedia(media, { duration: 20, currentTime: 4 })
    const pause = vi.fn()
    const load = vi.fn()
    Object.defineProperty(media, 'pause', { configurable: true, value: pause })
    Object.defineProperty(media, 'load', { configurable: true, value: load })
    Object.defineProperty(media, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    fireEvent.loadedMetadata(media)
    fireEvent.canPlay(media)
    await user.click(screen.getByRole('button', { name: '再生' }))
    fireEvent.change(screen.getByRole('slider', { name: '音量' }), {
      target: { value: '0.35' },
    })
    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: '再生速度' }),
      '0.8',
    )
    await user.click(screen.getByRole('button', { name: 'A地点を設定' }))
    fireEvent.change(screen.getByRole('slider', { name: '再生位置' }), {
      target: { value: '8' },
    })
    await user.click(screen.getByRole('button', { name: 'B地点を設定' }))
    await user.click(screen.getByRole('button', { name: 'A-Bループを開始' }))

    expect(requestFrame).toHaveBeenCalled()
    const queuedFrame = frameCallbacks.at(-1)
    expect(queuedFrame).toBeDefined()
    media.currentTime = 8.05
    const modeButton = screen.getByRole('button', { name: 'Listenへ戻る' })
    await user.click(modeButton)

    expect(mediaElement()).toBe(media)
    expect(media.currentTime).toBe(8.05)
    expect(media.playbackRate).toBe(1)
    expect(media.volume).toBe(0.35)
    expect(pause).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '一時停止' })).toBeInTheDocument()
    expect(modeButton).toHaveFocus()
    act(() => queuedFrame?.(0))
    expect(media.currentTime).toBe(8.05)

    await user.click(modeButton)
    expect(screen.getByText('A 0:04.00')).toBeInTheDocument()
    expect(screen.getByText('B 0:08.00')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'A-Bループを開始' }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('stays in Practice when normal playback speed cannot be restored', async () => {
    const user = userEvent.setup()
    render(<ListenPlayer {...createProps()} />)
    const media = mediaElement()
    prepareMedia(media)
    Object.defineProperty(media, 'preservesPitch', {
      configurable: true,
      writable: true,
      value: false,
    })
    let rate = 1
    Object.defineProperty(media, 'playbackRate', {
      configurable: true,
      get: () => rate,
      set: (value: number) => {
        if (value === 1) {
          throw new DOMException('unsupported', 'NotSupportedError')
        }
        rate = value
      },
    })
    fireEvent.loadedMetadata(media)
    fireEvent.canPlay(media)
    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: '再生速度' }),
      '0.8',
    )

    await user.click(screen.getByRole('button', { name: 'Listenへ戻る' }))

    expect(
      screen.getByRole('region', {
        name: 'Fixture Song のPracticeプレイヤー',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert', { name: '速度変更エラー' })).toHaveTextContent(
      '通常速度へ戻せませんでした',
    )
    expect(screen.getByRole('button', { name: 'Listenへ戻る' })).toHaveFocus()
  })

  it('keeps load recovery actionable when Listen rate restoration also fails', async () => {
    const user = userEvent.setup()
    render(<ListenPlayer {...createProps()} />)
    const media = mediaElement()
    prepareMedia(media)
    fireEvent.loadedMetadata(media)
    fireEvent.canPlay(media)
    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )

    Object.defineProperty(media, 'playbackRate', {
      configurable: true,
      get: () => 0.8,
      set: (value: number) => {
        if (value === 1) {
          throw new DOMException(
            '/private/fixture-root/secret.mp3',
            'NotSupportedError',
          )
        }
      },
    })
    fireEvent.error(media)
    await user.click(screen.getByRole('button', { name: 'Listenへ戻る' }))

    expect(
      screen.getByRole('region', {
        name: 'Fixture Song のPracticeプレイヤー',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('alert', { name: '音源の読み込みエラー' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '音源を再読み込み' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('alert', { name: '速度変更エラー' }),
    ).toBeNull()
    expect(document.body.textContent).not.toContain('/private/fixture-root')
  })

  it('keeps Practice and volume for the next Track but resets Track-scoped controls', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ListenPlayer {...createProps()} />)
    const firstMedia = mediaElement()
    prepareMedia(firstMedia, { duration: 20, currentTime: 4 })
    fireEvent.loadedMetadata(firstMedia)
    fireEvent.canPlay(firstMedia)
    fireEvent.change(screen.getByRole('slider', { name: '音量' }), {
      target: { value: '0.36' },
    })
    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: '再生速度' }),
      '0.8',
    )
    await user.click(screen.getByRole('button', { name: 'A地点を設定' }))
    fireEvent.change(screen.getByRole('slider', { name: '再生位置' }), {
      target: { value: '8' },
    })
    await user.click(screen.getByRole('button', { name: 'B地点を設定' }))
    await user.click(screen.getByRole('button', { name: 'A-Bループを開始' }))

    rerender(
      <ListenPlayer
        {...createProps({
          track: createTrack({
            id: 'track-two',
            path: '/private/fixture-root/Session/next.flac',
            relativePath: 'Session/next.flac',
            fileName: 'next.flac',
            title: 'Next Fixture',
            format: 'flac',
          }),
          sourceUrl: 'asset://fixture/next.flac',
          playbackRequest: pausedRequest(2, false),
        })}
      />,
    )

    const secondMedia = mediaElement()
    expect(secondMedia).not.toBe(firstMedia)
    expect(secondMedia.volume).toBe(0.36)
    expect(
      screen.getByRole('region', {
        name: 'Next Fixture のPracticeプレイヤー',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '再生速度' })).toHaveValue('1')
    expect(screen.getByText('A —')).toBeInTheDocument()
    expect(screen.getByText('B —')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'A-Bループを開始' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('keeps an A-B loop at the media end from advancing the queue', async () => {
    const user = userEvent.setup()
    const onEnded = vi.fn()
    render(<ListenPlayer {...createProps({ onEnded })} />)
    const media = mediaElement()
    prepareMedia(media, { duration: 20, currentTime: 4 })
    Object.defineProperty(media, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    fireEvent.loadedMetadata(media)
    fireEvent.canPlay(media)
    await user.click(screen.getByRole('button', { name: '再生' }))
    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )
    await user.click(screen.getByRole('button', { name: 'A地点を設定' }))
    fireEvent.change(screen.getByRole('slider', { name: '再生位置' }), {
      target: { value: '20' },
    })
    await user.click(screen.getByRole('button', { name: 'B地点を設定' }))
    await user.click(screen.getByRole('button', { name: 'A-Bループを開始' }))

    media.currentTime = 20
    fireEvent.timeUpdate(media)
    expect(media.currentTime).toBe(4)
    fireEvent.ended(media)

    expect(onEnded).not.toHaveBeenCalled()
    expect(screen.getByRole('status', { name: '現在曲' })).toHaveTextContent(
      'Fixture Song',
    )

    media.currentTime = 20
    act(() => {
      media.dispatchEvent(new Event('seeking'))
      media.dispatchEvent(new Event('pause'))
      media.dispatchEvent(new Event('ended'))
    })

    expect(onEnded).not.toHaveBeenCalled()
  })

  it('mounts Marker only in Practice and captures the live media position without controlling audio', async () => {
    const user = userEvent.setup()
    const markerGateway = createMarkerGateway()
    render(
      <Story0006ListenPlayer
        {...createProps()}
        markerGateway={markerGateway}
      />,
    )
    const media = mediaElement()
    prepareMedia(media, { duration: 125, currentTime: 41.236 })
    const source = media.getAttribute('src')
    const play = vi.fn().mockResolvedValue(undefined)
    const pause = vi.fn()
    const load = vi.fn()
    Object.defineProperty(media, 'play', { configurable: true, value: play })
    Object.defineProperty(media, 'pause', { configurable: true, value: pause })
    Object.defineProperty(media, 'load', { configurable: true, value: load })
    fireEvent.loadedMetadata(media)
    fireEvent.canPlay(media)
    await user.click(screen.getByRole('button', { name: '再生' }))
    fireEvent.change(screen.getByRole('slider', { name: '音量' }), {
      target: { value: '0.4' },
    })

    expect(screen.queryByRole('heading', { name: 'Marker' })).toBeNull()
    expect(markerGateway.loadMarkers).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: '再生速度' }),
      '0.8',
    )
    await user.click(screen.getByRole('button', { name: 'A地点を設定' }))
    fireEvent.change(screen.getByRole('slider', { name: '再生位置' }), {
      target: { value: '50' },
    })
    await user.click(screen.getByRole('button', { name: 'B地点を設定' }))
    await user.click(screen.getByRole('button', { name: 'A-Bループを開始' }))
    media.currentTime = 41.236

    expect(markerGateway.loadMarkers).toHaveBeenCalledWith('track-one')
    await user.click(
      await screen.findByRole('button', {
        name: '現在位置へMarkerを作成',
      }),
    )

    expect(markerGateway.createMarker).toHaveBeenCalledWith({
      trackId: 'track-one',
      positionMs: 41_236,
      label: '',
      body: '',
    })
    expect(mediaElement()).toBe(media)
    expect(media).toHaveAttribute('src', source)
    expect(media.currentTime).toBe(41.236)
    expect(media.volume).toBe(0.4)
    expect(media.playbackRate).toBe(0.8)
    expect(play).toHaveBeenCalledOnce()
    expect(pause).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '一時停止' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'A-Bループを停止' }),
    ).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Listenへ戻る' }))
    expect(screen.queryByRole('heading', { name: 'Marker' })).toBeNull()
  })

  it('does not enable Marker position actions before the current media is ready', async () => {
    const user = userEvent.setup()
    const markerGateway = createMarkerGateway([createMarker()])
    render(
      <Story0006ListenPlayer
        {...createProps()}
        markerGateway={markerGateway}
      />,
    )
    const media = mediaElement()

    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )
    const createButton = await screen.findByRole('button', {
      name: '現在位置へMarkerを作成',
    })
    const moveButton = screen.getByRole('button', {
      name: '0:36.50へ移動',
    })
    expect(createButton).toBeDisabled()
    expect(moveButton).toBeDisabled()

    prepareMedia(media)
    fireEvent.loadedMetadata(media)
    fireEvent.canPlay(media)
    expect(createButton).toBeEnabled()
    expect(moveButton).toBeEnabled()
  })

  it('clamps a newly captured Marker to the current media duration', async () => {
    const user = userEvent.setup()
    const markerGateway = createMarkerGateway()
    render(
      <Story0006ListenPlayer
        {...createProps()}
        markerGateway={markerGateway}
      />,
    )
    const media = mediaElement()
    prepareMedia(media, { duration: 10, currentTime: 15.75 })
    fireEvent.loadedMetadata(media)
    fireEvent.canPlay(media)
    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )
    await user.click(
      await screen.findByRole('button', {
        name: '現在位置へMarkerを作成',
      }),
    )

    expect(markerGateway.createMarker).toHaveBeenCalledWith(
      expect.objectContaining({ positionMs: 10_000 }),
    )
  })

  it('clamps a selected Marker to media duration while preserving play intent and source', async () => {
    const user = userEvent.setup()
    const markerGateway = createMarkerGateway([
      createMarker({ positionMs: 130_120 }),
    ])
    render(
      <Story0006ListenPlayer
        {...createProps()}
        markerGateway={markerGateway}
      />,
    )
    const media = mediaElement()
    prepareMedia(media, { duration: 125, currentTime: 12 })
    const source = media.getAttribute('src')
    const play = vi.fn().mockResolvedValue(undefined)
    const pause = vi.fn()
    const load = vi.fn()
    Object.defineProperty(media, 'play', { configurable: true, value: play })
    Object.defineProperty(media, 'pause', { configurable: true, value: pause })
    Object.defineProperty(media, 'load', { configurable: true, value: load })
    fireEvent.loadedMetadata(media)
    fireEvent.canPlay(media)
    await user.click(screen.getByRole('button', { name: '再生' }))
    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )

    await user.click(
      await screen.findByRole('button', { name: '2:10.12へ移動' }),
    )

    expect(mediaElement()).toBe(media)
    expect(media).toHaveAttribute('src', source)
    expect(media.currentTime).toBe(125)
    expect(play).toHaveBeenCalledOnce()
    expect(pause).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '一時停止' })).toBeInTheDocument()
  })

  it('does not surface a Marker load that settles after Practice unmount', async () => {
    const user = userEvent.setup()
    let resolveFirstLoad!: (markers: Story0006Marker[]) => void
    const firstLoad = new Promise<Story0006Marker[]>((resolve) => {
      resolveFirstLoad = resolve
    })
    const markerGateway = createMarkerGateway()
    vi.mocked(markerGateway.loadMarkers)
      .mockReturnValueOnce(firstLoad)
      .mockResolvedValueOnce([
        createMarker({
          id: 'marker-current',
          positionMs: 2_000,
          label: '現在の一覧',
        }),
      ])
    render(
      <Story0006ListenPlayer
        {...createProps()}
        markerGateway={markerGateway}
      />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )
    await user.click(screen.getByRole('button', { name: 'Listenへ戻る' }))

    await act(async () => {
      resolveFirstLoad([
        createMarker({
          id: 'marker-stale',
          label: '/private/old-track.mp3',
        }),
      ])
      await firstLoad
    })
    expect(screen.queryByRole('heading', { name: 'Marker' })).toBeNull()
    expect(document.body.textContent).not.toContain('/private/old-track')

    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )
    expect(await screen.findByText('現在の一覧')).toBeInTheDocument()
    expect(screen.queryByText('/private/old-track.mp3')).toBeNull()
    expect(markerGateway.loadMarkers).toHaveBeenCalledTimes(2)
  })

  it('starts history only after confirmed playing and closes it on pause', async () => {
    const historyGateway = createHistoryGateway()
    render(
      <Story0009ListenPlayer
        {...createProps()}
        historyGateway={historyGateway}
      />,
    )
    const media = mediaElement()
    prepareMedia(media, { duration: 125, currentTime: 12.345 })
    fireEvent.loadedMetadata(media)
    fireEvent.canPlay(media)
    fireEvent.timeUpdate(media)
    expect(historyGateway.startPlayEvent).not.toHaveBeenCalled()

    fireEvent.playing(media)
    await waitFor(() =>
      expect(historyGateway.startPlayEvent).toHaveBeenCalledWith({
        trackId: 'track-one',
        startPositionMs: 12_345,
        mode: 'listen',
        playbackRate: 1,
        loopStartMs: null,
        loopEndMs: null,
      }),
    )

    media.currentTime = 18.765
    fireEvent.pause(media)
    await waitFor(() =>
      expect(historyGateway.closePlayEvent).toHaveBeenCalledWith({
        id: 'event-1',
        trackId: 'track-one',
        endPositionMs: 18_765,
        reason: 'pause',
      }),
    )
  })

  it('splits playing history on mode, rate, loop, and manual seek but not time updates or loop wrap', async () => {
    const user = userEvent.setup()
    const historyGateway = createHistoryGateway()
    render(
      <Story0009ListenPlayer
        {...createProps()}
        historyGateway={historyGateway}
      />,
    )
    const media = mediaElement()
    prepareMedia(media, { duration: 125, currentTime: 10 })
    fireEvent.loadedMetadata(media)
    fireEvent.canPlay(media)
    fireEvent.playing(media)
    await waitFor(() =>
      expect(historyGateway.startPlayEvent).toHaveBeenCalledTimes(1),
    )

    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )
    await waitFor(() =>
      expect(historyGateway.startPlayEvent).toHaveBeenCalledTimes(2),
    )
    expect(historyGateway.closePlayEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ reason: 'mode-change' }),
    )

    await user.selectOptions(
      screen.getByRole('combobox', { name: '再生速度' }),
      '0.8',
    )
    await waitFor(() =>
      expect(historyGateway.startPlayEvent).toHaveBeenCalledTimes(3),
    )
    expect(historyGateway.startPlayEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'practice', playbackRate: 0.8 }),
    )

    await user.click(screen.getByRole('button', { name: 'A地点を設定' }))
    fireEvent.change(screen.getByRole('slider', { name: '再生位置' }), {
      target: { value: '20' },
    })
    await waitFor(() =>
      expect(historyGateway.closePlayEvent).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'manual-seek' }),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'B地点を設定' }))
    await user.click(
      screen.getByRole('button', { name: 'A-Bループを開始' }),
    )
    await waitFor(() =>
      expect(historyGateway.startPlayEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({ loopStartMs: 10_000, loopEndMs: 20_000 }),
      ),
    )

    const startsBeforeObservations = vi.mocked(historyGateway.startPlayEvent).mock
      .calls.length
    const closesBeforeObservations = vi.mocked(historyGateway.closePlayEvent).mock
      .calls.length
    media.currentTime = 20
    fireEvent.timeUpdate(media)
    fireEvent.seeked(media)
    await act(async () => Promise.resolve())
    expect(historyGateway.startPlayEvent).toHaveBeenCalledTimes(
      startsBeforeObservations,
    )
    expect(historyGateway.closePlayEvent).toHaveBeenCalledTimes(
      closesBeforeObservations,
    )
  })
})
