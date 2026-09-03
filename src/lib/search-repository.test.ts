import { describe, expect, it, vi } from 'vitest'

import {
  SearchQueryTooLongError,
  createSearchRepository,
} from './search-repository'

function createDatabase(rows: unknown[] = []) {
  return {
    execute: vi.fn(),
    select: vi.fn().mockResolvedValue(rows),
  }
}

describe('search repository Story 0008 contract', () => {
  it('does not read SQLite for a blank query', async () => {
    const database = createDatabase()
    const repository = createSearchRepository(database)

    await expect(repository.searchNotes(' \n\t ')).resolves.toEqual([])
    expect(database.select).not.toHaveBeenCalled()
  })

  it('counts Unicode code points and rejects more than 100 before reading SQLite', async () => {
    const database = createDatabase()
    const repository = createSearchRepository(database)

    await expect(repository.searchNotes('🎧'.repeat(100))).resolves.toEqual([])
    expect(database.select).toHaveBeenCalledOnce()
    database.select.mockClear()

    await expect(repository.searchNotes('🎧'.repeat(101))).rejects.toBeInstanceOf(
      SearchQueryTooLongError,
    )
    expect(database.select).not.toHaveBeenCalled()
  })

  it('binds escaped literal LIKE once and scopes every result to the latest publication', async () => {
    const database = createDatabase()
    const repository = createSearchRepository(database)

    await repository.searchNotes('  100%_!  ')

    const [query, bindValues] = database.select.mock.calls[0]
    expect(bindValues).toEqual(['%100!%!_!!%'])
    expect(query).toContain("LIKE $1 ESCAPE '!'")
    expect(query).toContain('ORDER BY publications.sequence DESC')
    expect(query).toContain('LIMIT 1')
    expect(query).toContain('UNION ALL')
    expect(query).toContain('track_notes.deleted_at IS NULL')
    expect(query).toContain('listening_notes.deleted_at IS NULL')
    expect(query).toContain('markers.deleted_at IS NULL')
    expect(query).toContain('ORDER BY created_at DESC, kind ASC, id ASC')
    expect(query).toContain('LIMIT 100')
    expect(query).not.toContain('100%_!')
    expect(query).not.toContain('root_path')
    expect(query).not.toContain('path')
    expect(query).not.toContain('source_identifier')
  })

  it('returns only the safe display projection in deterministic database order', async () => {
    const database = createDatabase([
      {
        id: 'marker-1',
        kind: 'marker',
        track_id: 'track-1',
        title: '灯り',
        artist: 'Fixture Artist',
        album: null,
        excerpt: 'ゴーストノート',
        created_at: '2026-09-02T12:00:00.000Z',
        position_ms: 42_500,
      },
      {
        id: 'track-note-1',
        kind: 'track-note',
        track_id: 'track-1',
        title: '灯り',
        artist: 'Fixture Artist',
        album: null,
        excerpt: 'ベースを聴く',
        created_at: '2026-09-02T11:00:00.000Z',
        position_ms: null,
      },
    ])
    const repository = createSearchRepository(database)

    await expect(repository.searchNotes('ゴースト')).resolves.toEqual([
      {
        id: 'marker-1',
        kind: 'marker',
        trackId: 'track-1',
        title: '灯り',
        artist: 'Fixture Artist',
        album: null,
        excerpt: 'ゴーストノート',
        createdAt: '2026-09-02T12:00:00.000Z',
        positionMs: 42_500,
      },
      {
        id: 'track-note-1',
        kind: 'track-note',
        trackId: 'track-1',
        title: '灯り',
        artist: 'Fixture Artist',
        album: null,
        excerpt: 'ベースを聴く',
        createdAt: '2026-09-02T11:00:00.000Z',
        positionMs: null,
      },
    ])
    expect(JSON.stringify(await repository.searchNotes('ゴースト'))).not.toContain(
      '/private/',
    )
  })
})
