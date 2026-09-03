import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from './App'

interface TestTrackInput {
  name: string
  path: string
}

function committedLibrary(tracks: TestTrackInput[]) {
  return {
    kind: 'committed' as const,
    snapshot: {
      folder: {
        id: 'folder-music',
        rootPath: '/Music',
        displayName: 'Music',
        selectedAt: '2026-09-02T00:00:00.000Z',
      },
      access: 'granted' as const,
      scan: { completeness: 'complete' as const, issues: [] },
      tracks: tracks.map((track, index) => ({
        id: `track-${index + 1}`,
        musicFolderId: 'folder-music',
        source: 'local' as const,
        sourceIdentifier: track.path.replace(/^\/Music\//, ''),
        path: track.path,
        relativePath: track.path.replace(/^\/Music\//, ''),
        fileName: track.name,
        format: track.name.split('.').at(-1)!.toLowerCase() as
          | 'wav'
          | 'mp3'
          | 'flac',
        title: track.name,
        artist: null,
        album: null,
        durationMs: null,
        metadataStatus: 'fallback' as const,
        updatedAt: '2026-09-02T00:00:00.000Z',
        presence: 'present' as const,
      })),
    },
  }
}

const createGateway = () => ({
  runtime: 'desktop' as const,
  checkDatabase: vi.fn().mockResolvedValue(undefined),
  loadLibrary: vi.fn().mockResolvedValue(null),
  chooseMusicFolder: vi.fn().mockResolvedValue(
    committedLibrary([
      {
        name: 'drum-fill.wav',
        path: '/Music/drum-fill.wav',
      },
    ]),
  ),
  chooseMusicFiles: vi.fn().mockResolvedValue({ kind: 'cancelled' }),
  reconnectMusicFolder: vi.fn().mockResolvedValue({ kind: 'cancelled' }),
  toAudioUrl: vi.fn((path: string) => `asset://localhost${path}`),
  loadMarkers: vi.fn().mockResolvedValue([]),
  createMarker: vi.fn(),
  updateMarker: vi.fn(),
  deleteMarker: vi.fn().mockResolvedValue(undefined),
  restoreMarker: vi.fn(
    async (input: { id: string; trackId: string }) => ({
      id: input.id,
      trackId: input.trackId,
      positionMs: 0,
      label: null,
      body: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    }),
  ),
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
  loadPlayEvents: vi.fn().mockResolvedValue([]),
  startPlayEvent: vi.fn(),
  closePlayEvent: vi.fn(),
  searchNotes: vi.fn().mockResolvedValue([]),
})

describe('LoupePlay Listen screen', () => {
  it('opens concise task-first Help as a modal and restores focus when closed', async () => {
    const user = userEvent.setup()
    const originalShowModal = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      'showModal',
    )
    const originalClose = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      'close',
    )
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    })
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: showModal,
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: close,
    })

    try {
      render(<App />)
      const trigger = screen.getByRole('button', { name: 'ヘルプを開く' })
      expect(trigger).toHaveTextContent('?')
      expect(trigger).toHaveAttribute('title', 'ヘルプを開く')

      await user.click(trigger)
      const dialog = screen.getByRole('dialog', {
        name: 'LoupePlayの使い方',
      })
      expect(showModal).toHaveBeenCalledOnce()
      expect(
        screen.getByRole('heading', { name: 'LoupePlayの使い方' }),
      ).toHaveFocus()
      for (const heading of [
        'まず聴く',
        '聴き直す',
        'メモを使い分ける',
        '保存について',
      ]) {
        expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
      }
      expect(dialog).toHaveTextContent('Track Note')
      expect(dialog).toHaveTextContent('Listening Note')
      expect(dialog).toHaveTextContent('Marker')
      expect(dialog).not.toHaveAttribute('aria-describedby')

      fireEvent(dialog, new Event('cancel', { cancelable: true }))
      await waitFor(() => expect(close).toHaveBeenCalledOnce())
      expect(trigger).toHaveFocus()
      expect(dialog).not.toHaveAttribute('open')
    } finally {
      if (originalShowModal) {
        Object.defineProperty(
          HTMLDialogElement.prototype,
          'showModal',
          originalShowModal,
        )
      } else {
        delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal
      }
      if (originalClose) {
        Object.defineProperty(
          HTMLDialogElement.prototype,
          'close',
          originalClose,
        )
      } else {
        delete (HTMLDialogElement.prototype as { close?: unknown }).close
      }
    }
  })

  it('identifies the browser preview before offering desktop-only operations', async () => {
    render(<App />)

    expect(
      await screen.findByRole('status', { name: 'ローカル保存' }),
    ).toHaveTextContent('デスクトップアプリで利用できます')
    expect(
      screen.getByRole('status', { name: 'ライブラリの状態' }),
    ).toHaveTextContent('ブラウザでは音楽ファイルやフォルダを開けません')
    expect(
      screen.getByRole('button', { name: '音楽ファイルを選ぶ' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: '音楽フォルダを選ぶ' }),
    ).toBeDisabled()
    expect(screen.getByText(/npm run tauri dev/)).toBeInTheDocument()
  })

  it('places the compact product header immediately before the working library', () => {
    render(<App />)

    const productHeading = screen.getByRole('heading', {
      level: 1,
      name: 'LoupePlay',
    })
    const listenHeading = screen.getByRole('heading', {
      level: 2,
      name: 'Listen',
    })
    const libraryHeading = screen.getByRole('heading', {
      level: 3,
      name: '音楽ライブラリ',
    })

    expect(
      productHeading.compareDocumentPosition(listenHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
    expect(
      listenHeading.compareDocumentPosition(libraryHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
    expect(
      screen.getByText('音楽を聴く。気になったら、覗き込む。'),
    ).toBeInTheDocument()
  })

  it('removes the foundation showcase and duplicate Practice controls from Listen', () => {
    render(<App />)

    expect(screen.queryByText('デスクトップ基盤')).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('再生画面のコンセプト表現'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'SQLite' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        name: '聴くことから、深く潜ることまで。',
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('まだ、プレイヤーのふりはしない。'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '再生速度' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'A-Bループ' })).not.toBeInTheDocument()
  })

  it('reports local storage health as a compact supporting status', async () => {
    const gateway = createGateway()

    render(<App gateway={gateway} />)

    expect(
      screen.getByRole('status', { name: 'ローカル保存' }),
    ).toHaveTextContent('確認中')
    expect(
      await screen.findByRole('status', { name: 'ローカル保存' }),
    ).toHaveTextContent('利用できます')
    expect(gateway.checkDatabase).toHaveBeenCalledOnce()
  })

  it('opens a selected Track in the custom Listen player', async () => {
    const user = userEvent.setup()
    const gateway = createGateway()

    render(<App gateway={gateway} />)

    await user.click(
      screen.getByRole('button', { name: '音楽フォルダを選ぶ' }),
    )
    await user.click(
      await screen.findByRole('button', { name: 'drum-fill.wav を選ぶ' }),
    )

    expect(gateway.chooseMusicFolder).toHaveBeenCalledOnce()
    expect(gateway.toAudioUrl).toHaveBeenCalledWith('/Music/drum-fill.wav')
    expect(
      screen.getByRole('region', {
        name: 'drum-fill.wav のListenプレイヤー',
      }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('listen-audio')).toHaveAttribute(
      'src',
      'asset://localhost/Music/drum-fill.wav',
    )
    expect(screen.getByTestId('listen-audio')).not.toHaveAttribute('controls')
    expect(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    ).toBeInTheDocument()
  })

  it('reflects the active player mode in the screen heading without reopening audio', async () => {
    const user = userEvent.setup()
    const gateway = createGateway()

    render(<App gateway={gateway} />)
    await user.click(
      screen.getByRole('button', { name: '音楽フォルダを選ぶ' }),
    )
    await user.click(
      await screen.findByRole('button', { name: 'drum-fill.wav を選ぶ' }),
    )
    const media = screen.getByTestId('listen-audio')

    await user.click(
      screen.getByRole('button', { name: 'Practiceへ切り替える' }),
    )
    expect(
      screen.getByRole('heading', { level: 2, name: 'Practice' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('listen-audio')).toBe(media)
    expect(gateway.toAudioUrl).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Listenへ戻る' }))
    expect(
      screen.getByRole('heading', { level: 2, name: 'Listen' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('listen-audio')).toBe(media)
    expect(gateway.toAudioUrl).toHaveBeenCalledOnce()
  })

  it('keeps the library state outside the busy results and retains it on cancellation', async () => {
    const user = userEvent.setup()
    let resolveScan!: (
      result: ReturnType<typeof committedLibrary>,
    ) => void
    const gateway = createGateway()
    gateway.chooseMusicFolder
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveScan = resolve
        }),
      )
      .mockResolvedValueOnce({ kind: 'cancelled' })

    render(<App gateway={gateway} />)

    const chooseButton = screen.getByRole('button', {
      name: '音楽フォルダを選ぶ',
    })
    await user.click(chooseButton)

    const results = screen.getByRole('group', { name: 'ライブラリの内容' })
    const libraryStatus = screen.getByRole('status', {
      name: 'ライブラリの状態',
    })
    expect(results).toHaveAttribute('aria-busy', 'true')
    expect(libraryStatus.closest('[aria-busy="true"]')).toBeNull()

    await act(async () => {
      resolveScan(
        committedLibrary([
          { name: 'song.mp3', path: '/Music/song.mp3' },
        ]),
      )
    })
    expect(
      await screen.findByRole('button', { name: 'song.mp3 を選ぶ' }),
    ).toBeInTheDocument()

    await user.click(chooseButton)
    expect(
      screen.getByRole('button', { name: 'song.mp3 を選ぶ' }),
    ).toBeInTheDocument()
  })

  it('shows a storage failure without hiding the playable surface', async () => {
    const gateway = createGateway()
    gateway.checkDatabase.mockRejectedValueOnce(new Error('database unavailable'))

    render(<App gateway={gateway} />)

    expect(
      await screen.findByRole('status', { name: 'ローカル保存' }),
    ).toHaveTextContent('確認できません')
    expect(
      screen.getByRole('button', { name: '音楽フォルダを選ぶ' }),
    ).toBeInTheDocument()
  })
})
