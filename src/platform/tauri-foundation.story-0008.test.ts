import { beforeEach, describe, expect, it, vi } from 'vitest'

const searchResult = {
  id: 'marker-1',
  kind: 'marker' as const,
  trackId: 'track-1',
  title: '灯り',
  artist: null,
  album: null,
  excerpt: 'ゴーストノート',
  createdAt: '2026-09-02T12:00:00.000Z',
  positionMs: 42_000,
}

const mocks = vi.hoisted(() => {
  const searchRepository = { searchNotes: vi.fn() }
  return {
    convertFileSrc: vi.fn(),
    createSearchRepository: vi.fn(() => searchRepository),
    get: vi.fn(),
    invoke: vi.fn(),
    isTauri: vi.fn(),
    join: vi.fn(),
    load: vi.fn(),
    open: vi.fn(),
    readDir: vi.fn(),
    searchRepository,
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
vi.mock('../lib/search-repository', () => ({
  createSearchRepository: mocks.createSearchRepository,
}))

import { tauriFoundationGateway } from './tauri-foundation'

describe('tauriFoundationGateway Story 0008 search boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockReturnValue({ execute: vi.fn(), select: vi.fn() })
    mocks.searchRepository.searchNotes.mockResolvedValue([searchResult])
  })

  it('delegates the query through the fixed local database', async () => {
    await expect(
      tauriFoundationGateway.searchNotes('ゴースト'),
    ).resolves.toEqual([searchResult])

    expect(mocks.get).toHaveBeenCalledOnce()
    expect(mocks.get).toHaveBeenCalledWith('sqlite:loupe-play.db')
    expect(mocks.createSearchRepository).toHaveBeenCalledWith(
      mocks.get.mock.results[0].value,
    )
    expect(mocks.searchRepository.searchNotes).toHaveBeenCalledWith(
      'ゴースト',
    )
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.readDir).not.toHaveBeenCalled()
    expect(mocks.convertFileSrc).not.toHaveBeenCalled()
  })
})
