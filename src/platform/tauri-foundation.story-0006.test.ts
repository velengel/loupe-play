import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Marker {
  id: string
  trackId: string
  positionMs: number
  label: string | null
  body: string | null
  createdAt: string
  updatedAt: string
}

interface MarkerGateway {
  loadMarkers: (trackId: string) => Promise<Marker[]>
  createMarker: (input: {
    trackId: string
    positionMs: number
    label: string | null
    body: string | null
  }) => Promise<Marker>
  updateMarker: (input: {
    id: string
    trackId: string
    positionMs: number
    label: string | null
    body: string | null
  }) => Promise<Marker>
  deleteMarker: (input: { id: string; trackId: string }) => Promise<void>
  restoreMarker: (input: { id: string; trackId: string }) => Promise<Marker>
}

const marker = {
  id: 'marker-one',
  trackId: 'track-one',
  positionMs: 12_000,
  label: 'フィル',
  body: null,
  createdAt: '2026-09-02T05:00:00.000Z',
  updatedAt: '2026-09-02T05:00:00.000Z',
} satisfies Marker

const mocks = vi.hoisted(() => {
  const markerRepository = {
    loadMarkers: vi.fn(),
    createMarker: vi.fn(),
    updateMarker: vi.fn(),
    deleteMarker: vi.fn(),
    restoreMarker: vi.fn(),
  }

  return {
    convertFileSrc: vi.fn(),
    createMarkerRepository: vi.fn(() => markerRepository),
    get: vi.fn(),
    invoke: vi.fn(),
    isTauri: vi.fn(),
    join: vi.fn(),
    load: vi.fn(),
    markerRepository,
    open: vi.fn(),
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

import { tauriFoundationGateway } from './tauri-foundation'

const markerGateway =
  tauriFoundationGateway as typeof tauriFoundationGateway & MarkerGateway

describe('tauriFoundationGateway Story 0006 Marker boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const database = { execute: vi.fn(), select: vi.fn() }
    mocks.get.mockReturnValue(database)
    mocks.createMarkerRepository.mockReturnValue(mocks.markerRepository)
    mocks.markerRepository.loadMarkers.mockResolvedValue([marker])
    mocks.markerRepository.createMarker.mockResolvedValue(marker)
    mocks.markerRepository.updateMarker.mockResolvedValue({
      ...marker,
      label: '更新済み',
    })
    mocks.markerRepository.deleteMarker.mockResolvedValue(undefined)
    mocks.markerRepository.restoreMarker.mockResolvedValue(marker)
  })

  it('delegates Marker DTO operations through only the fixed LoupePlay database', async () => {
    const createInput = {
      trackId: 'track-one',
      positionMs: 12_000,
      label: 'フィル',
      body: null,
    }
    const updateInput = {
      id: 'marker-one',
      trackId: 'track-one',
      positionMs: 13_000,
      label: '更新済み',
      body: null,
    }
    const identity = { id: 'marker-one', trackId: 'track-one' }

    await expect(markerGateway.loadMarkers('track-one')).resolves.toEqual([
      marker,
    ])
    await expect(markerGateway.createMarker(createInput)).resolves.toEqual(
      marker,
    )
    await expect(markerGateway.updateMarker(updateInput)).resolves.toMatchObject(
      { id: 'marker-one', label: '更新済み' },
    )
    await expect(markerGateway.deleteMarker(identity)).resolves.toBeUndefined()
    await expect(markerGateway.restoreMarker(identity)).resolves.toEqual(marker)

    expect(mocks.get).toHaveBeenCalledTimes(5)
    expect(mocks.get.mock.calls).toEqual(
      Array.from({ length: 5 }, () => ['sqlite:loupe-play.db']),
    )
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.createMarkerRepository).toHaveBeenCalledTimes(5)
    expect(mocks.createMarkerRepository.mock.calls).toEqual(
      Array.from({ length: 5 }, () => [mocks.get.mock.results[0].value]),
    )
    expect(mocks.markerRepository.loadMarkers).toHaveBeenCalledWith('track-one')
    expect(mocks.markerRepository.createMarker).toHaveBeenCalledWith(createInput)
    expect(mocks.markerRepository.updateMarker).toHaveBeenCalledWith(updateInput)
    expect(mocks.markerRepository.deleteMarker).toHaveBeenCalledWith(identity)
    expect(mocks.markerRepository.restoreMarker).toHaveBeenCalledWith(identity)
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.readDir).not.toHaveBeenCalled()
    expect(mocks.convertFileSrc).not.toHaveBeenCalled()
  })
})
