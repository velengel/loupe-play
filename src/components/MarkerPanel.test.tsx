import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import MarkerPanel from './MarkerPanel'

interface Marker {
  id: string
  trackId: string
  positionMs: number
  label: string | null
  body: string | null
  createdAt: string
  updatedAt: string
}

interface MarkerCreateInput {
  trackId: string
  positionMs: number
  label: string | null
  body: string | null
}

interface MarkerUpdateInput extends MarkerCreateInput {
  id: string
}

interface MarkerIdentityInput {
  id: string
  trackId: string
}

interface MarkerGateway {
  loadMarkers: (trackId: string) => Promise<Marker[]>
  createMarker: (input: MarkerCreateInput) => Promise<Marker>
  updateMarker: (input: MarkerUpdateInput) => Promise<Marker>
  deleteMarker: (input: MarkerIdentityInput) => Promise<void>
  restoreMarker: (input: MarkerIdentityInput) => Promise<Marker>
}

interface MarkerPanelProps {
  trackId: string
  gateway: MarkerGateway
  getCurrentPositionSeconds: () => number
  onSelectPositionMs: (positionMs: number) => void
  mediaReady?: boolean
  maximumPositionSeconds?: number
}

const Story0006MarkerPanel = MarkerPanel as React.ComponentType<MarkerPanelProps>

function createMarker(
  overrides: Partial<Marker> = {},
): Marker {
  return {
    id: 'marker-one',
    trackId: 'track-one',
    positionMs: 36_500,
    label: 'ハイハット',
    body: '裏拍の粒を確認する',
    createdAt: '2026-09-02T02:00:00.000Z',
    updatedAt: '2026-09-02T02:00:00.000Z',
    ...overrides,
  }
}

function createGateway(markers: Marker[] = []): MarkerGateway {
  let storedMarkers = [...markers]
  const deletedMarkers = new Map<string, Marker>()

  return {
    loadMarkers: vi.fn().mockImplementation(async (trackId) =>
      storedMarkers.filter((marker) => marker.trackId === trackId),
    ),
    createMarker: vi.fn().mockImplementation(async (input) => {
      const created = createMarker({
        id: 'marker-created',
        trackId: input.trackId,
        positionMs: input.positionMs,
        label: input.label?.trim() || null,
        body: input.body?.trim() || null,
      })
      storedMarkers = [
        ...storedMarkers.filter((marker) => marker.id !== created.id),
        created,
      ]
      return created
    }),
    updateMarker: vi.fn().mockImplementation(async (input) => {
      const current = storedMarkers.find(
        (marker) => marker.id === input.id && marker.trackId === input.trackId,
      )
      const updated = createMarker({
        ...current,
        id: input.id,
        trackId: input.trackId,
        positionMs: input.positionMs,
        label: input.label?.trim() || null,
        body: input.body?.trim() || null,
        updatedAt: '2026-09-02T02:05:00.000Z',
      })
      storedMarkers = [
        ...storedMarkers.filter((marker) => marker.id !== updated.id),
        updated,
      ]
      return updated
    }),
    deleteMarker: vi.fn().mockImplementation(async (input) => {
      const deleted = storedMarkers.find(
        (marker) => marker.id === input.id && marker.trackId === input.trackId,
      )
      if (deleted) {
        deletedMarkers.set(deleted.id, deleted)
      }
      storedMarkers = storedMarkers.filter(
        (marker) => marker.id !== input.id || marker.trackId !== input.trackId,
      )
    }),
    restoreMarker: vi.fn().mockImplementation(async (input) => {
      const restored =
        deletedMarkers.get(input.id) ??
        createMarker({ id: input.id, trackId: input.trackId })
      deletedMarkers.delete(input.id)
      storedMarkers = [
        ...storedMarkers.filter((marker) => marker.id !== restored.id),
        restored,
      ]
      return restored
    }),
  }
}

function renderPanel(
  overrides: Partial<MarkerPanelProps> = {},
) {
  const gateway = overrides.gateway ?? createGateway()
  const props: MarkerPanelProps = {
    trackId: 'track-one',
    gateway,
    getCurrentPositionSeconds: () => 12.345,
    onSelectPositionMs: vi.fn(),
    ...overrides,
  }

  return {
    ...render(<Story0006MarkerPanel {...props} />),
    gateway,
    props,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('MarkerPanel Story 0006 contract', () => {
  it('loads one Track without a path and renders deterministic, accessible Marker controls', async () => {
    const markers = [
      createMarker({
        id: 'marker-first',
        positionMs: 12_000,
        label: null,
        body: null,
        createdAt: '2026-09-02T02:00:00.000Z',
      }),
      createMarker({
        id: 'marker-tied-a',
        positionMs: 36_500,
        createdAt: '2026-09-02T02:01:00.000Z',
      }),
      createMarker({
        id: 'marker-tied-b',
        positionMs: 36_500,
        label: 'ベース',
        body: null,
        createdAt: '2026-09-02T02:01:00.000Z',
      }),
    ]
    const gateway = createGateway(markers)

    const { container } = renderPanel({ gateway })

    expect(
      screen.getByRole('heading', { level: 6, name: 'Marker' }),
    ).toBeInTheDocument()
    expect(gateway.loadMarkers).toHaveBeenCalledWith('track-one')
    expect(
      await screen.findByRole('region', { name: 'Marker一覧' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /へ移動$/ }).map((button) =>
        button.textContent,
      ),
    ).toEqual(['0:12.00', '0:36.50', '0:36.50'])
    for (const accessibleName of [
      '0:36.50 ハイハット（同時刻1件目）のMarkerへ移動',
      '0:36.50 ハイハット（同時刻1件目）のMarkerを編集',
      '0:36.50 ハイハット（同時刻1件目）のMarkerを削除',
      '0:36.50 ベース（同時刻2件目）のMarkerへ移動',
      '0:36.50 ベース（同時刻2件目）のMarkerを編集',
      '0:36.50 ベース（同時刻2件目）のMarkerを削除',
    ]) {
      expect(
        screen.getByRole('button', { name: accessibleName }),
      ).toBeInTheDocument()
    }
    expect(screen.getByText('無題のマーカー')).toBeInTheDocument()
    expect(screen.getByLabelText('Markerの名前（任意）').tagName).toBe(
      'INPUT',
    )
    expect(screen.getByLabelText('Markerのメモ（任意）').tagName).toBe(
      'TEXTAREA',
    )
    expect(
      screen.getByRole('button', { name: '現在位置へMarkerを作成' }),
    ).toHaveAttribute('type', 'button')
    expect(container.innerHTML).not.toContain('/private/')
    expect(container.innerHTML).not.toContain('SELECT ')
  })

  it('captures the button-time position in integer milliseconds and allows an empty label and body', async () => {
    const user = userEvent.setup()
    const pendingCreate = deferred<Marker>()
    const gateway = createGateway()
    const createdMarker = createMarker({
      id: 'marker-created',
      positionMs: 41_236,
      label: null,
      body: null,
    })
    vi.mocked(gateway.loadMarkers)
      .mockResolvedValueOnce([])
      .mockResolvedValue([createdMarker])
    vi.mocked(gateway.createMarker).mockReturnValueOnce(pendingCreate.promise)
    const getCurrentPositionSeconds = vi.fn(() => 41.236)
    renderPanel({ gateway, getCurrentPositionSeconds })
    await screen.findByRole('region', { name: 'Marker一覧' })

    const createButton = screen.getByRole('button', {
      name: '現在位置へMarkerを作成',
    })
    await user.click(createButton)

    expect(getCurrentPositionSeconds).toHaveBeenCalledOnce()
    expect(gateway.createMarker).toHaveBeenCalledWith({
      trackId: 'track-one',
      positionMs: 41_236,
      label: '',
      body: '',
    })
    expect(createButton).toBeDisabled()
    await user.click(createButton)
    expect(gateway.createMarker).toHaveBeenCalledOnce()

    await act(async () => {
      pendingCreate.resolve(createdMarker)
      await pendingCreate.promise
    })

    expect(
      screen.getByRole('button', { name: '0:41.23へ移動' }),
    ).toBeInTheDocument()
    expect(createButton).toBeEnabled()
  })

  it('keeps media-position actions unavailable until the current source is ready', async () => {
    const user = userEvent.setup()
    const onSelectPositionMs = vi.fn()
    const gateway = createGateway([createMarker()])
    renderPanel({ gateway, mediaReady: false, onSelectPositionMs })

    const moveButton = await screen.findByRole('button', {
      name: '0:36.50へ移動',
    })
    const createButton = screen.getByRole('button', {
      name: '現在位置へMarkerを作成',
    })
    expect(moveButton).toBeDisabled()
    expect(createButton).toBeDisabled()

    await user.click(
      screen.getByRole('button', { name: '0:36.50のMarkerを編集' }),
    )
    expect(
      screen.getByRole('button', { name: '現在位置を使う' }),
    ).toBeDisabled()
    expect(gateway.createMarker).not.toHaveBeenCalled()
    expect(onSelectPositionMs).not.toHaveBeenCalled()
  })

  it('clamps an adopted media position to the current duration before saving', async () => {
    const user = userEvent.setup()
    const gateway = createGateway([createMarker()])
    renderPanel({
      gateway,
      getCurrentPositionSeconds: () => 15.75,
      maximumPositionSeconds: 10,
    })

    await user.click(
      await screen.findByRole('button', {
        name: '0:36.50のMarkerを編集',
      }),
    )
    await user.click(screen.getByRole('button', { name: '現在位置を使う' }))
    expect(screen.getByText('保存位置 0:10.00')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '変更を保存' }))

    expect(gateway.updateMarker).toHaveBeenCalledWith(
      expect.objectContaining({ positionMs: 10_000 }),
    )
  })

  it('selects a persisted millisecond position without owning media playback', async () => {
    const user = userEvent.setup()
    const onSelectPositionMs = vi.fn()
    renderPanel({
      gateway: createGateway([
        createMarker({ positionMs: 130_120 }),
      ]),
      onSelectPositionMs,
    })

    await user.click(
      await screen.findByRole('button', { name: '2:10.12へ移動' }),
    )

    expect(onSelectPositionMs).toHaveBeenCalledWith(130_120)
  })

  it('edits text and adopts the current position only after an explicit action', async () => {
    const user = userEvent.setup()
    const gateway = createGateway([createMarker()])
    const getCurrentPositionSeconds = vi.fn(() => 77.776)
    renderPanel({ gateway, getCurrentPositionSeconds })

    await user.click(
      await screen.findByRole('button', {
        name: '0:36.50のMarkerを編集',
      }),
    )
    const editName = screen.getByLabelText('編集するMarkerの名前（任意）')
    const editBody = screen.getByLabelText('編集するMarkerのメモ（任意）')
    await user.clear(editName)
    await user.type(editName, '  スネア  ')
    await user.clear(editBody)
    await user.type(editBody, '  ゴーストノート  ')

    expect(getCurrentPositionSeconds).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '現在位置を使う' }))
    expect(getCurrentPositionSeconds).toHaveBeenCalledOnce()
    expect(screen.getByText('保存位置 1:17.77')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '変更を保存' }))

    expect(gateway.updateMarker).toHaveBeenCalledWith({
      id: 'marker-one',
      trackId: 'track-one',
      positionMs: 77_776,
      label: '  スネア  ',
      body: '  ゴーストノート  ',
    })
    expect(
      await screen.findByRole('button', { name: '1:17.77へ移動' }),
    ).toBeInTheDocument()
  })

  it('requires inline confirmation before soft deletion and restores the same Marker', async () => {
    const user = userEvent.setup()
    const original = createMarker()
    const gateway = createGateway([original])
    renderPanel({ gateway })

    const deleteButton = await screen.findByRole('button', {
      name: '0:36.50のMarkerを削除',
    })
    await user.click(deleteButton)

    expect(gateway.deleteMarker).not.toHaveBeenCalled()
    expect(
      screen.getByRole('group', { name: '0:36.50のMarker削除確認' }),
    ).toHaveTextContent('ハイハット')
    const confirmButton = screen.getByRole('button', {
      name: 'このMarkerを削除する',
    })
    expect(confirmButton).toHaveFocus()
    await user.click(confirmButton)

    expect(gateway.deleteMarker).toHaveBeenCalledWith({
      id: 'marker-one',
      trackId: 'track-one',
    })
    expect(
      await screen.findByRole('status', { name: 'Markerを削除しました' }),
    ).toHaveTextContent('0:36.50')
    expect(
      screen.queryByRole('button', { name: '0:36.50へ移動' }),
    ).toBeNull()

    await user.click(screen.getByRole('button', { name: '元に戻す' }))

    expect(gateway.restoreMarker).toHaveBeenCalledWith({
      id: 'marker-one',
      trackId: 'track-one',
    })
    expect(
      await screen.findByRole('button', { name: '0:36.50へ移動' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('status', { name: 'Markerを削除しました' }),
    ).toBeNull()
  })

  it('moves keyboard focus into editing and back through delete and restore', async () => {
    const user = userEvent.setup()
    const gateway = createGateway([createMarker()])
    renderPanel({ gateway })

    const editButton = await screen.findByRole('button', {
      name: '0:36.50のMarkerを編集',
    })
    await user.click(editButton)

    expect(
      screen.getByLabelText('編集するMarkerの名前（任意）'),
    ).toHaveFocus()
    expect(
      screen.queryByRole('button', {
        name: '0:36.50のMarkerを削除',
      }),
    ).toBeNull()

    await user.click(screen.getByRole('button', { name: '編集をやめる' }))
    expect(
      screen.getByRole('button', { name: '0:36.50のMarkerを編集' }),
    ).toHaveFocus()

    await user.click(
      screen.getByRole('button', { name: '0:36.50のMarkerを削除' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'このMarkerを削除する' }),
    )
    const undoButton = await screen.findByRole('button', {
      name: '元に戻す',
    })
    expect(undoButton).toHaveFocus()

    await user.click(undoButton)
    expect(
      await screen.findByRole('button', { name: '0:36.50へ移動' }),
    ).toHaveFocus()
  })

  it('returns focus to an available action after restore while media is unavailable', async () => {
    const user = userEvent.setup()
    const original = createMarker()
    const gateway = createGateway([original])
    renderPanel({ gateway, mediaReady: false })

    expect(
      await screen.findByRole('button', { name: '0:36.50へ移動' }),
    ).toBeDisabled()
    await user.click(
      screen.getByRole('button', { name: '0:36.50のMarkerを削除' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'このMarkerを削除する' }),
    )
    await user.click(await screen.findByRole('button', { name: '元に戻す' }))

    expect(
      await screen.findByRole('button', {
        name: '0:36.50のMarkerを編集',
      }),
    ).toHaveFocus()
    expect(
      screen.getByRole('button', { name: '0:36.50へ移動' }),
    ).toBeDisabled()
  })

  it('isolates late loads and failures by Track identity', async () => {
    const firstLoad = deferred<Marker[]>()
    const secondLoad = deferred<Marker[]>()
    const gateway = createGateway()
    vi.mocked(gateway.loadMarkers)
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise)
    const { rerender } = renderPanel({ gateway, trackId: 'track-one' })

    rerender(
      <Story0006MarkerPanel
        trackId="track-two"
        gateway={gateway}
        getCurrentPositionSeconds={() => 2}
        onSelectPositionMs={vi.fn()}
      />,
    )
    await act(async () => {
      secondLoad.resolve([
        createMarker({
          id: 'marker-current',
          trackId: 'track-two',
          positionMs: 2_000,
          label: '現在のTrack',
        }),
      ])
      await secondLoad.promise
    })
    expect(screen.getByText('現在のTrack')).toBeInTheDocument()

    await act(async () => {
      firstLoad.reject(
        new Error('/private/old-track.mp3 SELECT * FROM markers'),
      )
      await firstLoad.promise.catch(() => undefined)
    })

    expect(screen.getByText('現在のTrack')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).not.toContain('/private/old-track')
    expect(document.body.textContent).not.toContain('SELECT *')
  })

  it('keeps successful Markers and input while showing a fixed save error', async () => {
    const user = userEvent.setup()
    const gateway = createGateway([createMarker()])
    vi.mocked(gateway.createMarker).mockRejectedValueOnce(
      new Error('/private/music/secret.wav: INSERT INTO markers failed'),
    )
    renderPanel({ gateway })
    await screen.findByRole('button', { name: '0:36.50へ移動' })
    await user.type(screen.getByLabelText('Markerの名前（任意）'), '残す入力')

    await user.click(
      screen.getByRole('button', { name: '現在位置へMarkerを作成' }),
    )

    expect(
      await screen.findByRole('alert', { name: 'Marker保存エラー' }),
    ).toHaveTextContent(
      'Markerを保存できませんでした。入力内容と現在の音声は保持しています。',
    )
    expect(screen.getByLabelText('Markerの名前（任意）')).toHaveValue(
      '残す入力',
    )
    expect(
      screen.getByRole('button', { name: '0:36.50へ移動' }),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('/private/music')
    expect(document.body.textContent).not.toContain('INSERT INTO')
  })

  it('classifies load, delete, and restore failures without raw details', async () => {
    const user = userEvent.setup()
    const loadGateway = createGateway()
    vi.mocked(loadGateway.loadMarkers).mockRejectedValueOnce(
      new Error('/private/a.wav: SELECT failed'),
    )
    const { unmount } = renderPanel({ gateway: loadGateway })
    expect(
      await screen.findByRole('alert', { name: 'Marker読込エラー' }),
    ).toHaveTextContent(
      'Markerを読み込めませんでした。Practiceを開き直してください。',
    )
    expect(screen.queryByText('Markerはまだありません。')).toBeNull()
    expect(
      screen.getByRole('button', { name: '現在位置へMarkerを作成' }),
    ).toBeDisabled()
    expect(document.body.textContent).not.toContain('/private/a.wav')
    unmount()

    const original = createMarker()
    const operationGateway = createGateway([original])
    vi.mocked(operationGateway.deleteMarker).mockRejectedValueOnce(
      new Error('DELETE FROM markers /private/b.wav'),
    )
    const { unmount: unmountDeleteFailure } = renderPanel({
      gateway: operationGateway,
    })
    await user.click(
      await screen.findByRole('button', {
        name: '0:36.50のMarkerを削除',
      }),
    )
    await user.click(
      screen.getByRole('button', { name: 'このMarkerを削除する' }),
    )
    expect(
      await screen.findByRole('alert', { name: 'Marker削除エラー' }),
    ).toHaveTextContent(
      'Markerを削除できませんでした。Markerは一覧に残しています。',
    )
    expect(
      screen.getByRole('button', { name: '0:36.50へ移動' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '0:36.50のMarkerを削除' }),
    ).toHaveFocus()
    unmountDeleteFailure()

    const restoreGateway = createGateway([original])
    vi.mocked(restoreGateway.deleteMarker).mockResolvedValueOnce(undefined)
    vi.mocked(restoreGateway.restoreMarker).mockRejectedValueOnce(
      new Error('UPDATE markers /private/c.wav'),
    )
    renderPanel({ gateway: restoreGateway })
    await user.click(
      await screen.findByRole('button', {
        name: '0:36.50のMarkerを削除',
      }),
    )
    await user.click(
      screen.getByRole('button', { name: 'このMarkerを削除する' }),
    )
    await user.click(await screen.findByRole('button', { name: '元に戻す' }))

    expect(
      await screen.findByRole('alert', { name: 'Marker復元エラー' }),
    ).toHaveTextContent(
      'Markerを復元できませんでした。もう一度試してください。',
    )
    expect(screen.getByRole('button', { name: '元に戻す' })).toBeEnabled()
    expect(document.body.textContent).not.toContain('/private/')
    expect(document.body.textContent).not.toContain('DELETE FROM')
    expect(document.body.textContent).not.toContain('UPDATE markers')
  })

  it('ignores a mutation that resolves after unmount', async () => {
    const user = userEvent.setup()
    const pendingCreate = deferred<Marker>()
    const gateway = createGateway()
    vi.mocked(gateway.createMarker).mockReturnValueOnce(pendingCreate.promise)
    const { unmount } = renderPanel({ gateway })
    await screen.findByRole('region', { name: 'Marker一覧' })
    await user.click(
      screen.getByRole('button', { name: '現在位置へMarkerを作成' }),
    )
    unmount()

    await act(async () => {
      pendingCreate.resolve(
        createMarker({ id: 'marker-too-late', label: '遅い作成結果' }),
      )
      await pendingCreate.promise
    })

    await waitFor(() => {
      expect(screen.queryByText('遅い作成結果')).toBeNull()
    })
  })

  it('keeps a pending Track A mutation out of Track B', async () => {
    const user = userEvent.setup()
    const pendingCreate = deferred<Marker>()
    const gateway = createGateway()
    vi.mocked(gateway.loadMarkers).mockImplementation(async (trackId) =>
      trackId === 'track-two'
        ? [
            createMarker({
              id: 'marker-track-two',
              trackId,
              label: 'Track BのMarker',
            }),
          ]
        : [],
    )
    vi.mocked(gateway.createMarker).mockReturnValueOnce(pendingCreate.promise)
    const { rerender } = renderPanel({ gateway, trackId: 'track-one' })
    await screen.findByRole('region', { name: 'Marker一覧' })
    await user.click(
      screen.getByRole('button', { name: '現在位置へMarkerを作成' }),
    )

    rerender(
      <Story0006MarkerPanel
        trackId="track-two"
        gateway={gateway}
        getCurrentPositionSeconds={() => 2}
        onSelectPositionMs={vi.fn()}
      />,
    )
    expect(await screen.findByText('Track BのMarker')).toBeInTheDocument()

    await act(async () => {
      pendingCreate.resolve(
        createMarker({
          id: 'marker-old-track',
          label: '/private/old-track.mp3',
        }),
      )
      await pendingCreate.promise
    })

    expect(screen.getByText('Track BのMarker')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('/private/old-track')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps raw persistence failures out of markup and the console', async () => {
    const rawFailure = '/private/secret.wav SELECT * FROM markers'
    const gateway = createGateway()
    vi.mocked(gateway.loadMarkers).mockRejectedValueOnce(
      new Error(rawFailure),
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { container } = renderPanel({ gateway })
    await screen.findByRole('alert', { name: 'Marker読込エラー' })

    expect(container.innerHTML).not.toContain('/private/secret.wav')
    expect(container.innerHTML).not.toContain('SELECT * FROM markers')
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('stays usable and reloads after an older panel mutation settles', async () => {
    const user = userEvent.setup()
    const pendingCreate = deferred<Marker>()
    const created = createMarker({
      id: 'marker-created-before-reopen',
      label: '閉じた間に保存済み',
    })
    let persistedMarkers: Marker[] = []
    const gateway = createGateway()
    vi.mocked(gateway.loadMarkers).mockImplementation(
      async () => [...persistedMarkers],
    )
    vi.mocked(gateway.createMarker).mockImplementation(() =>
      pendingCreate.promise.then((marker) => {
        persistedMarkers = [marker]
        return marker
      }),
    )

    const firstPanel = renderPanel({ gateway })
    await screen.findByRole('region', { name: 'Marker一覧' })
    await user.click(
      screen.getByRole('button', { name: '現在位置へMarkerを作成' }),
    )
    firstPanel.unmount()

    renderPanel({ gateway })
    expect(await screen.findByText('Markerはまだありません。')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '現在位置へMarkerを作成' }),
    ).toBeEnabled()
    expect(gateway.loadMarkers).toHaveBeenCalledTimes(2)

    await act(async () => {
      pendingCreate.resolve(created)
      await pendingCreate.promise
    })

    expect(await screen.findByText('閉じた間に保存済み')).toBeInTheDocument()
    expect(gateway.loadMarkers).toHaveBeenCalledTimes(3)
  })

  it('does not let an older completion reload overwrite a newer panel mutation', async () => {
    const user = userEvent.setup()
    const oldCreate = deferred<Marker>()
    const currentCreate = deferred<Marker>()
    const staleReload = deferred<Marker[]>()
    const oldMarker = createMarker({
      id: 'marker-old-completion',
      label: '先の保存',
    })
    const currentMarker = createMarker({
      id: 'marker-current-completion',
      label: '後の保存',
    })
    const gateway = createGateway()
    vi.mocked(gateway.loadMarkers)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(staleReload.promise)
      .mockResolvedValueOnce([oldMarker, currentMarker])
    vi.mocked(gateway.createMarker)
      .mockReturnValueOnce(oldCreate.promise)
      .mockReturnValueOnce(currentCreate.promise)

    const firstPanel = renderPanel({ gateway })
    await screen.findByText('Markerはまだありません。')
    await user.click(
      screen.getByRole('button', { name: '現在位置へMarkerを作成' }),
    )
    firstPanel.unmount()

    renderPanel({ gateway })
    await screen.findByText('Markerはまだありません。')
    await user.click(
      screen.getByRole('button', { name: '現在位置へMarkerを作成' }),
    )

    await act(async () => {
      oldCreate.resolve(oldMarker)
      await oldCreate.promise
    })
    await waitFor(() => expect(gateway.loadMarkers).toHaveBeenCalledTimes(3))

    await act(async () => {
      currentCreate.resolve(currentMarker)
      await currentCreate.promise
    })
    expect(await screen.findByText('後の保存')).toBeInTheDocument()

    await act(async () => {
      staleReload.resolve([oldMarker])
      await staleReload.promise
    })

    expect(screen.getByText('後の保存')).toBeInTheDocument()
    expect(gateway.loadMarkers).toHaveBeenCalledTimes(4)
  })
})
