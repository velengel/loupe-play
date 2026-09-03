import { describe, expect, it, vi } from 'vitest'

import { createNoteRepository } from './note-repository'

const dependencies = {
  createNoteId: () => 'note-1',
  now: () => '2026-09-02T11:00:00.000Z',
}

const trackNoteRow = {
  id: 'note-1',
  track_id: 'track-1',
  body: '曲全体のベースを聴く',
  created_at: '2026-09-02T11:00:00.000Z',
  updated_at: '2026-09-02T11:00:00.000Z',
  deleted_at: null,
}

const listeningNoteRow = {
  ...trackNoteRow,
  play_event_id: 'event-1',
  body: '今日はAメロがよかった',
  play_event_started_at: '2026-09-02T10:00:00.000Z',
  play_event_start_position_ms: 12_000,
  play_event_end_position_ms: 48_000,
  play_event_loop_start_ms: null,
  play_event_loop_end_ms: null,
}

describe('Note repository', () => {
  it('loads active Track and Listening Notes in deterministic newest-first order', async () => {
    const database = {
      execute: vi.fn(),
      select: vi
        .fn()
        .mockResolvedValueOnce([trackNoteRow])
        .mockResolvedValueOnce([listeningNoteRow]),
    }
    const repository = createNoteRepository(database, dependencies)

    await expect(repository.loadTrackNotes('track-1')).resolves.toEqual([
      {
        id: 'note-1',
        trackId: 'track-1',
        body: '曲全体のベースを聴く',
        createdAt: '2026-09-02T11:00:00.000Z',
        updatedAt: '2026-09-02T11:00:00.000Z',
      },
    ])
    await expect(repository.loadListeningNotes('track-1')).resolves.toEqual([
      {
        id: 'note-1',
        playEventId: 'event-1',
        trackId: 'track-1',
        body: '今日はAメロがよかった',
        playEventStartedAt: '2026-09-02T10:00:00.000Z',
        playEventStartPositionMs: 12_000,
        playEventEndPositionMs: 48_000,
        playEventLoopStartMs: null,
        playEventLoopEndMs: null,
        createdAt: '2026-09-02T11:00:00.000Z',
        updatedAt: '2026-09-02T11:00:00.000Z',
      },
    ])
    for (const [query, values] of database.select.mock.calls) {
      expect(query).toMatch(/deleted_at\s+IS\s+NULL/i)
      expect(query).toMatch(/ORDER BY[\s\S]*created_at\s+DESC[\s\S]*id\s+DESC/i)
      expect(values).toEqual(['track-1'])
    }
    expect(database.select.mock.calls[1][0]).toMatch(
      /events\.start_position_ms\s+AS\s+play_event_start_position_ms/i,
    )
    expect(database.select.mock.calls[1][0]).toMatch(
      /events\.end_position_ms\s+AS\s+play_event_end_position_ms/i,
    )
  })

  it('creates both Note types with trimmed bound bodies and atomic RETURNING', async () => {
    const database = {
      execute: vi.fn(),
      select: vi
        .fn()
        .mockResolvedValueOnce([trackNoteRow])
        .mockResolvedValueOnce([listeningNoteRow]),
    }
    const repository = createNoteRepository(database, dependencies)

    await repository.createTrackNote({
      trackId: 'track-1',
      body: '  曲全体のベースを聴く  ',
    })
    await repository.createListeningNote({
      playEventId: 'event-1',
      trackId: 'track-1',
      body: '  今日はAメロがよかった  ',
    })

    expect(database.execute).not.toHaveBeenCalled()
    expect(database.select.mock.calls[0][0]).toMatch(
      /INSERT\s+INTO\s+track_notes[\s\S]*RETURNING/i,
    )
    expect(database.select.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['note-1', 'track-1', '曲全体のベースを聴く']),
    )
    expect(database.select.mock.calls[1][0]).toMatch(
      /INSERT\s+INTO\s+listening_notes[\s\S]*SELECT[\s\S]*FROM\s+play_events[\s\S]*id\s*=\s*\$\d+[\s\S]*track_id\s*=\s*\$\d+[\s\S]*RETURNING/i,
    )
  })

  it.each(['', '   ', '\n\t'])('rejects blank body %j before access', async (body) => {
    const database = { execute: vi.fn(), select: vi.fn() }
    const repository = createNoteRepository(database, dependencies)

    await expect(
      repository.createTrackNote({ trackId: 'track-1', body }),
    ).rejects.toThrow(/Note/i)
    await expect(
      repository.createListeningNote({
        playEventId: 'event-1',
        trackId: 'track-1',
        body,
      }),
    ).rejects.toThrow(/Note/i)
    expect(database.select).not.toHaveBeenCalled()
  })

  it('uses Track-scoped RETURNING updates for edit, soft delete, and restore', async () => {
    const restoredRow = { ...trackNoteRow, updated_at: dependencies.now() }
    const database = {
      execute: vi.fn(),
      select: vi.fn().mockResolvedValue([restoredRow]),
    }
    const repository = createNoteRepository(database, dependencies)

    await repository.updateTrackNote({
      id: 'note-1',
      trackId: 'track-1',
      body: '更新した本文',
    })
    await repository.deleteTrackNote({ id: 'note-1', trackId: 'track-1' })
    await repository.restoreTrackNote({ id: 'note-1', trackId: 'track-1' })

    const statements = database.select.mock.calls.map(([query]) => String(query))
    expect(statements).toHaveLength(3)
    expect(statements.every((query) => /UPDATE\s+track_notes/i.test(query))).toBe(true)
    expect(statements.every((query) => /track_id\s*=\s*\$\d+/i.test(query))).toBe(true)
    expect(statements.every((query) => /RETURNING/i.test(query))).toBe(true)
    expect(statements.join('\n')).not.toMatch(/DELETE\s+FROM/i)
  })

  it('rejects missing or malformed readback and redacts raw failures', async () => {
    const missingRepository = createNoteRepository(
      { execute: vi.fn(), select: vi.fn().mockResolvedValue([]) },
      dependencies,
    )
    await expect(
      missingRepository.createTrackNote({ trackId: 'track-1', body: '本文' }),
    ).rejects.toThrow(/Note/i)

    const rawRepository = createNoteRepository(
      {
        execute: vi.fn(),
        select: vi.fn().mockRejectedValue(
          new Error('SQLITE /private/secret.wav INSERT track_notes'),
        ),
      },
      dependencies,
    )
    await expect(
      rawRepository.loadTrackNotes('track-1'),
    ).rejects.not.toThrow(/private|SQLITE|INSERT/)

    const malformedContextRepository = createNoteRepository(
      {
        execute: vi.fn(),
        select: vi.fn().mockResolvedValue([
          { ...listeningNoteRow, play_event_start_position_ms: 12.5 },
        ]),
      },
      dependencies,
    )
    await expect(
      malformedContextRepository.loadListeningNotes('track-1'),
    ).rejects.toThrow(/Note/i)
  })
})
