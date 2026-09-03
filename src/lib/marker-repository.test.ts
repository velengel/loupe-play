import { describe, expect, it, vi } from 'vitest'

import { createMarkerRepository } from './marker-repository'

interface MarkerRow {
  id: string
  track_id: string
  position_ms: number
  label: string | null
  body: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function normalizedSql(query: string): string {
  return query.replace(/\s+/g, ' ').trim()
}

function boundValue(
  query: string,
  values: unknown[],
  pattern: RegExp,
): unknown {
  const match = query.match(pattern)
  return match ? values[Number(match[1]) - 1] : undefined
}

function insertedRecord(
  query: string,
  values: unknown[],
): Record<string, unknown> {
  const match = query.match(
    /INSERT\s+INTO\s+markers\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/i,
  )

  if (!match) {
    throw new Error(`unsupported Marker INSERT in fake database: ${query}`)
  }

  const columns = match[1].split(',').map((column) => column.trim())
  const valueExpressions = match[2]
    .split(',')
    .map((expression) => expression.trim())

  return Object.fromEntries(
    columns.map((column, index) => {
      const expression = valueExpressions[index] ?? 'NULL'
      const placeholder = expression.match(/^\$(\d+)$/)

      return [
        column,
        placeholder ? values[Number(placeholder[1]) - 1] : null,
      ]
    }),
  )
}

function createStatefulMarkerDatabase(seed: MarkerRow[] = []) {
  const rows = seed.map((row) => ({ ...row }))

  const applyMutation = async (
    query: string,
    values: unknown[] = [],
  ): Promise<unknown> => {
    const sql = normalizedSql(query)

    if (/^INSERT INTO markers\b/i.test(sql)) {
      const record = insertedRecord(query, values)
      rows.push({
        id: String(record.id),
        track_id: String(record.track_id),
        position_ms: Number(record.position_ms),
        label: typeof record.label === 'string' ? record.label : null,
        body: typeof record.body === 'string' ? record.body : null,
        created_at: String(record.created_at),
        updated_at: String(record.updated_at),
        deleted_at:
          typeof record.deleted_at === 'string' ? record.deleted_at : null,
      })
      return { rowsAffected: 1 }
    }

    if (/^UPDATE markers\b/i.test(sql)) {
      const id = boundValue(
        query,
        values,
        /WHERE[\s\S]*?\bid\s*=\s*\$(\d+)/i,
      )
      const trackId = boundValue(
        query,
        values,
        /WHERE[\s\S]*?\btrack_id\s*=\s*\$(\d+)/i,
      )
      const row = rows.find(
        (candidate) =>
          candidate.id === id && candidate.track_id === trackId,
      )

      if (!row) {
        return { rowsAffected: 0 }
      }
      if (/WHERE[\s\S]*deleted_at\s+IS\s+NULL/i.test(query)) {
        if (row.deleted_at !== null) {
          return { rowsAffected: 0 }
        }
      }
      if (/WHERE[\s\S]*deleted_at\s+IS\s+NOT\s+NULL/i.test(query)) {
        if (row.deleted_at === null) {
          return { rowsAffected: 0 }
        }
      }

      for (const column of [
        'position_ms',
        'label',
        'body',
        'updated_at',
        'deleted_at',
      ] as const) {
        const value = boundValue(
          query,
          values,
          new RegExp(`(?:SET|,)\\s*${column}\\s*=\\s*\\$(\\d+)`, 'i'),
        )

        if (value !== undefined) {
          Object.assign(row, { [column]: value })
        }
      }

      if (/(?:SET|,)\s*deleted_at\s*=\s*NULL/i.test(query)) {
        row.deleted_at = null
      }

      return { rowsAffected: 1 }
    }

    throw new Error(`unsupported execute in fake database: ${query}`)
  }

  const execute = vi.fn(applyMutation)

  const select = vi.fn(
    async (query: string, values: unknown[] = []): Promise<unknown> => {
      const sql = normalizedSql(query)

      if (
        /^(?:INSERT|UPDATE)\s+(?:INTO\s+)?markers\b/i.test(sql) &&
        /\bRETURNING\b/i.test(sql)
      ) {
        const mutationResult = (await applyMutation(query, values)) as {
          rowsAffected: number
        }
        if (mutationResult.rowsAffected !== 1) {
          return []
        }
        const record = /^INSERT\b/i.test(sql)
          ? insertedRecord(query, values)
          : null
        const id = record
          ? record.id
          : boundValue(query, values, /WHERE[\s\S]*?\bid\s*=\s*\$(\d+)/i)
        const trackId = record
          ? record.track_id
          : boundValue(
              query,
              values,
              /WHERE[\s\S]*?\btrack_id\s*=\s*\$(\d+)/i,
            )
        return rows
          .filter(
            (row) => row.id === id && row.track_id === trackId,
          )
          .map((row) => ({ ...row }))
      }

      if (!/\bFROM markers\b/i.test(sql)) {
        throw new Error(`unsupported select in fake database: ${query}`)
      }

      const id = boundValue(query, values, /\bid\s*=\s*\$(\d+)/i)
      const trackId = boundValue(
        query,
        values,
        /\btrack_id\s*=\s*\$(\d+)/i,
      )
      const selected = rows
        .filter((row) => id === undefined || row.id === id)
        .filter((row) => trackId === undefined || row.track_id === trackId)
        .filter(
          (row) =>
            !/deleted_at\s+IS\s+NULL/i.test(sql) ||
            row.deleted_at === null,
        )
        .filter(
          (row) =>
            !/deleted_at\s+IS\s+NOT\s+NULL/i.test(sql) ||
            row.deleted_at !== null,
        )

      if (
        /ORDER BY position_ms ASC, created_at ASC, id ASC/i.test(sql)
      ) {
        selected.sort(
          (left, right) =>
            left.position_ms - right.position_ms ||
            left.created_at.localeCompare(right.created_at) ||
            left.id.localeCompare(right.id),
        )
      }

      return selected.map((row) => ({ ...row }))
    },
  )

  return { database: { execute, select }, execute, rows, select }
}

const firstRow: MarkerRow = {
  id: 'marker-b',
  track_id: 'track-1',
  position_ms: 42_000,
  label: 'フィル入り',
  body: null,
  created_at: '2026-09-02T00:00:01.000Z',
  updated_at: '2026-09-02T00:00:01.000Z',
  deleted_at: null,
}

const dependencies = {
  createMarkerId: () => '00000000-0000-4000-8000-000000000001',
  now: () => '2026-09-02T03:04:05.000Z',
}

describe('Marker repository reads', () => {
  it('loads only active Markers in position, creation time, and UUID order', async () => {
    const fake = createStatefulMarkerDatabase([
      firstRow,
      {
        ...firstRow,
        id: 'marker-deleted',
        position_ms: 100,
        deleted_at: '2026-09-02T02:00:00.000Z',
      },
      {
        ...firstRow,
        id: 'marker-c',
        position_ms: 12_000,
        created_at: '2026-09-02T00:00:02.000Z',
      },
      {
        ...firstRow,
        id: 'marker-a',
        position_ms: 12_000,
        created_at: '2026-09-02T00:00:02.000Z',
        label: null,
        body: 'ベースを聴く',
      },
      { ...firstRow, id: 'marker-other', track_id: 'track-2' },
    ])
    const repository = createMarkerRepository(fake.database, dependencies)

    await expect(repository.loadMarkers('track-1')).resolves.toEqual([
      {
        id: 'marker-a',
        trackId: 'track-1',
        positionMs: 12_000,
        label: null,
        body: 'ベースを聴く',
        createdAt: '2026-09-02T00:00:02.000Z',
        updatedAt: '2026-09-02T00:00:01.000Z',
      },
      {
        id: 'marker-c',
        trackId: 'track-1',
        positionMs: 12_000,
        label: 'フィル入り',
        body: null,
        createdAt: '2026-09-02T00:00:02.000Z',
        updatedAt: '2026-09-02T00:00:01.000Z',
      },
      {
        id: 'marker-b',
        trackId: 'track-1',
        positionMs: 42_000,
        label: 'フィル入り',
        body: null,
        createdAt: '2026-09-02T00:00:01.000Z',
        updatedAt: '2026-09-02T00:00:01.000Z',
      },
    ])

    expect(fake.select).toHaveBeenCalledWith(
      expect.stringMatching(
        /WHERE\s+track_id\s*=\s*\$1[\s\S]*deleted_at\s+IS\s+NULL[\s\S]*ORDER BY\s+position_ms\s+ASC,\s*created_at\s+ASC,\s*id\s+ASC/i,
      ),
      ['track-1'],
    )
  })

  it.each([
    ['a negative position', { ...firstRow, position_ms: -1 }],
    ['a fractional position', { ...firstRow, position_ms: 1.5 }],
    ['a foreign Track identity', { ...firstRow, track_id: 'track-2' }],
    ['a malformed nullable field', { ...firstRow, label: 42 }],
  ])('rejects a stored row with %s', async (_case, row) => {
    const database = {
      execute: vi.fn(),
      select: vi.fn().mockResolvedValue([row]),
    }
    const repository = createMarkerRepository(database, dependencies)

    await expect(repository.loadMarkers('track-1')).rejects.toThrow(
      /stored Marker/i,
    )
  })
})

describe('Marker repository writes', () => {
  it('commits and verifies a create in one SQLite RETURNING statement', async () => {
    const database = {
      execute: vi.fn(),
      select: vi.fn().mockResolvedValue([
        {
          ...firstRow,
          id: dependencies.createMarkerId(),
          position_ms: 42_250,
          label: 'フィル入り',
          created_at: dependencies.now(),
          updated_at: dependencies.now(),
        },
      ]),
    }
    const repository = createMarkerRepository(database, dependencies)

    await expect(
      repository.createMarker({
        trackId: 'track-1',
        positionMs: 42_250,
        label: 'フィル入り',
        body: null,
      }),
    ).resolves.toMatchObject({
      id: dependencies.createMarkerId(),
      positionMs: 42_250,
    })

    expect(database.execute).not.toHaveBeenCalled()
    expect(database.select).toHaveBeenCalledOnce()
    expect(database.select.mock.calls[0][0]).toMatch(
      /INSERT[\s\S]*RETURNING[\s\S]*deleted_at/i,
    )
  })

  it('creates a UUID Marker with bound values and normalizes blank text to null', async () => {
    const fake = createStatefulMarkerDatabase()
    const repository = createMarkerRepository(fake.database, dependencies)

    await expect(
      repository.createMarker({
        trackId: 'track-1',
        positionMs: 42_250,
        label: '  フィル入り  ',
        body: ' \n\t ',
      }),
    ).resolves.toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      trackId: 'track-1',
      positionMs: 42_250,
      label: 'フィル入り',
      body: null,
      createdAt: '2026-09-02T03:04:05.000Z',
      updatedAt: '2026-09-02T03:04:05.000Z',
    })

    const [query, values] = fake.select.mock.calls.find(([candidate]) =>
      /^\s*INSERT\s+INTO\s+markers/i.test(String(candidate)),
    ) as [
      string,
      unknown[],
    ]
    expect(query).toMatch(/INSERT\s+INTO\s+markers/i)
    expect(query).toMatch(/RETURNING[\s\S]*deleted_at/i)
    expect(fake.execute).not.toHaveBeenCalled()
    expect(query).not.toContain('track-1')
    expect(query).not.toContain('フィル入り')
    expect(insertedRecord(query, values)).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      track_id: 'track-1',
      position_ms: 42_250,
      label: 'フィル入り',
      body: null,
      created_at: '2026-09-02T03:04:05.000Z',
      updated_at: '2026-09-02T03:04:05.000Z',
      deleted_at: null,
    })
  })

  it('allows multiple UUIDs at the same position on one Track', async () => {
    const fake = createStatefulMarkerDatabase()
    let sequence = 0
    const repository = createMarkerRepository(fake.database, {
      createMarkerId: () =>
        `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
      now: dependencies.now,
    })
    const input = {
      trackId: 'track-1',
      positionMs: 12_000,
      label: null,
      body: null,
    }

    await repository.createMarker(input)
    await repository.createMarker(input)

    await expect(repository.loadMarkers('track-1')).resolves.toMatchObject([
      {
        id: '00000000-0000-4000-8000-000000000001',
        positionMs: 12_000,
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        positionMs: 12_000,
      },
    ])
    expect(
      fake.select.mock.calls.filter(([query]) =>
        /INSERT\s+INTO\s+markers/i.test(String(query)),
      ),
    ).toHaveLength(2)
    expect(fake.execute).not.toHaveBeenCalled()
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    'rejects invalid position %s before touching the database',
    async (positionMs) => {
      const fake = createStatefulMarkerDatabase()
      const repository = createMarkerRepository(fake.database, dependencies)

      await expect(
        repository.createMarker({
          trackId: 'track-1',
          positionMs,
          label: null,
          body: null,
        }),
      ).rejects.toThrow(/non-negative safe integer/i)
      await expect(
        repository.updateMarker({
          id: 'marker-b',
          trackId: 'track-1',
          positionMs,
          label: null,
          body: null,
        }),
      ).rejects.toThrow(/non-negative safe integer/i)
      expect(fake.execute).not.toHaveBeenCalled()
      expect(fake.select).not.toHaveBeenCalled()
    },
  )

  it('updates position, label, and body with Track-scoped bound values', async () => {
    const fake = createStatefulMarkerDatabase([firstRow])
    const repository = createMarkerRepository(fake.database, dependencies)

    await expect(
      repository.updateMarker({
        id: 'marker-b',
        trackId: 'track-1',
        positionMs: 51_375,
        label: '  コーラス  ',
        body: '  後ろの声を確認  ',
      }),
    ).resolves.toEqual({
      id: 'marker-b',
      trackId: 'track-1',
      positionMs: 51_375,
      label: 'コーラス',
      body: '後ろの声を確認',
      createdAt: firstRow.created_at,
      updatedAt: dependencies.now(),
    })

    const [query, values] = fake.select.mock.calls.find(([candidate]) =>
      /^\s*UPDATE\s+markers/i.test(String(candidate)),
    ) as [
      string,
      unknown[],
    ]
    expect(query).toMatch(/UPDATE\s+markers/i)
    expect(query).toMatch(/RETURNING[\s\S]*deleted_at/i)
    expect(fake.execute).not.toHaveBeenCalled()
    expect(query).toMatch(/WHERE[\s\S]*id\s*=\s*\$\d+/i)
    expect(query).toMatch(/WHERE[\s\S]*track_id\s*=\s*\$\d+/i)
    expect(query).toMatch(/deleted_at\s+IS\s+NULL/i)
    expect(query).not.toContain('コーラス')
    expect(values).toEqual(
      expect.arrayContaining([
        51_375,
        'コーラス',
        '後ろの声を確認',
        dependencies.now(),
        'marker-b',
        'track-1',
      ]),
    )
  })

  it('soft deletes and restores the same Marker without a DELETE statement', async () => {
    const fake = createStatefulMarkerDatabase([firstRow])
    const repository = createMarkerRepository(fake.database, dependencies)

    await repository.deleteMarker({ id: 'marker-b', trackId: 'track-1' })
    await expect(repository.loadMarkers('track-1')).resolves.toEqual([])
    expect(fake.rows).toHaveLength(1)
    expect(fake.rows[0]).toMatchObject({
      id: 'marker-b',
      deleted_at: dependencies.now(),
      updated_at: dependencies.now(),
    })

    await expect(
      repository.restoreMarker({ id: 'marker-b', trackId: 'track-1' }),
    ).resolves.toMatchObject({
      id: 'marker-b',
      trackId: 'track-1',
      updatedAt: dependencies.now(),
    })
    await expect(repository.loadMarkers('track-1')).resolves.toMatchObject([
      { id: 'marker-b', trackId: 'track-1', positionMs: 42_000 },
    ])
    expect(fake.rows).toHaveLength(1)
    expect(fake.rows[0].deleted_at).toBeNull()

    const mutationCalls = fake.select.mock.calls.filter(([query]) =>
      /^\s*UPDATE\s+markers/i.test(String(query)),
    )
    const statements = mutationCalls
      .map(([query]) => String(query))
      .join('\n')
    const [deleteQuery, restoreQuery] = mutationCalls.map(
      ([query]) => String(query),
    )
    expect(statements).not.toMatch(/\bDELETE\s+FROM\s+markers\b/i)
    expect(fake.execute).not.toHaveBeenCalled()
    expect(deleteQuery).toMatch(/UPDATE\s+markers/i)
    expect(deleteQuery).toMatch(/deleted_at\s*=\s*\$\d+/i)
    expect(deleteQuery).toMatch(/WHERE[\s\S]*\bid\s*=\s*\$\d+/i)
    expect(deleteQuery).toMatch(/WHERE[\s\S]*\btrack_id\s*=\s*\$\d+/i)
    expect(deleteQuery).toMatch(/deleted_at\s+IS\s+NULL/i)
    expect(deleteQuery).toMatch(/RETURNING[\s\S]*deleted_at/i)
    expect(restoreQuery).toMatch(/UPDATE\s+markers/i)
    expect(restoreQuery).toMatch(/deleted_at\s*=\s*NULL/i)
    expect(restoreQuery).toMatch(/WHERE[\s\S]*\bid\s*=\s*\$\d+/i)
    expect(restoreQuery).toMatch(/WHERE[\s\S]*\btrack_id\s*=\s*\$\d+/i)
    expect(restoreQuery).toMatch(/deleted_at\s+IS\s+NOT\s+NULL/i)
    expect(restoreQuery).toMatch(/RETURNING[\s\S]*deleted_at/i)
  })

  it('rejects a mutation when no Track-scoped row can be read back', async () => {
    const database = {
      execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
      select: vi.fn().mockResolvedValue([]),
    }
    const repository = createMarkerRepository(database, dependencies)

    await expect(
      repository.createMarker({
        trackId: 'track-unknown',
        positionMs: 0,
        label: null,
        body: null,
      }),
    ).rejects.toThrow(/Marker/i)
  })

  it.each([
    ['no row', []],
    ['multiple rows', [firstRow, { ...firstRow, id: 'marker-c' }]],
    ['a malformed row', [{ ...firstRow, position_ms: 1.5 }]],
  ])('rejects a RETURNING mutation with %s', async (_case, rows) => {
    const database = {
      execute: vi.fn(),
      select: vi.fn().mockResolvedValue(rows),
    }
    const repository = createMarkerRepository(database, dependencies)

    await expect(
      repository.updateMarker({
        id: 'marker-b',
        trackId: 'track-1',
        positionMs: 42_000,
        label: null,
        body: null,
      }),
    ).rejects.toThrow(/Marker/i)
    expect(database.execute).not.toHaveBeenCalled()
    expect(database.select).toHaveBeenCalledOnce()
  })

  it('replaces raw database failures with a stable Marker boundary error', async () => {
    const rawFailure =
      'SQLITE_CONSTRAINT markers at /Private/Reference Music/raw-file.wav'
    const database = {
      execute: vi.fn().mockRejectedValue(new Error(rawFailure)),
      select: vi.fn().mockRejectedValue(new Error(rawFailure)),
    }
    const repository = createMarkerRepository(database, dependencies)
    const operations = [
      () => repository.loadMarkers('track-1'),
      () =>
        repository.createMarker({
          trackId: 'track-1',
          positionMs: 0,
          label: null,
          body: null,
        }),
      () =>
        repository.updateMarker({
          id: 'marker-b',
          trackId: 'track-1',
          positionMs: 0,
          label: null,
          body: null,
        }),
      () =>
        repository.deleteMarker({ id: 'marker-b', trackId: 'track-1' }),
      () =>
        repository.restoreMarker({ id: 'marker-b', trackId: 'track-1' }),
    ]

    for (const operation of operations) {
      let rejection: unknown
      try {
        await operation()
      } catch (error) {
        rejection = error
      }

      expect(rejection).toBeInstanceOf(Error)
      expect(String(rejection)).toMatch(/Marker/i)
      expect(String(rejection)).not.toContain('SQLITE_CONSTRAINT')
      expect(String(rejection)).not.toContain('/Private/Reference Music')
      expect(String(rejection)).not.toContain('raw-file.wav')
    }
  })
})
