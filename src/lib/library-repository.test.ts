import { describe, expect, it, vi } from 'vitest'

import { createLibraryRepository } from './library-repository'

const indexedLibrary = {
  folder: {
    id: 'folder-new',
    rootPath: '/Private/Reference Music',
    displayName: 'Reference Music',
  },
  tracks: [
    {
      id: 'track-1',
      musicFolderId: 'folder-new',
      source: 'local' as const,
      sourceIdentifier: 'session/take.FLAC',
      path: '/Private/Reference Music/session/take.FLAC',
      relativePath: 'session/take.FLAC',
      fileName: 'take.FLAC',
      format: 'flac' as const,
      title: 'take',
      artist: null,
      album: null,
      durationMs: null,
      metadataStatus: 'fallback' as const,
      updatedAt: '2026-09-02T00:00:00.000Z',
    },
  ],
  selectedAt: '2026-09-02T00:00:00.000Z',
  expectedFolderGeneration: 0,
}

function normalizedSql(query: string): string {
  return query.replace(/\s+/g, ' ').trim()
}

function insertedRecord(
  query: string,
  values: unknown[],
): Record<string, unknown> {
  const match = query.match(
    /INSERT\s+INTO\s+\w+\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/i,
  )

  if (!match) {
    throw new Error(`unsupported INSERT in fake database: ${query}`)
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

function boundValue(
  query: string,
  values: unknown[],
  pattern: RegExp,
): unknown {
  const match = query.match(pattern)
  return match ? values[Number(match[1]) - 1] : undefined
}

interface FakeFolderRow {
  id: string
  root_path: string
  display_name: string
  selected_at: string | null
}

interface FakeSnapshotRow {
  id: string
  music_folder_id: string
  selected_at: string | null
  sequence: number
}

interface FakePublicationRow {
  sequence: number
  library_snapshot_id: string
  music_folder_id: string
  folder_generation: number
  selected_at: string
}

interface FakeTrackIdentityRow {
  id: string
  music_folder_id: string
  source: string
  source_identifier: string
}

function createStatefulLibraryDatabase() {
  const folders: FakeFolderRow[] = []
  const identities: FakeTrackIdentityRow[] = []
  const snapshots: FakeSnapshotRow[] = []
  const publications: FakePublicationRow[] = []
  const tracks: Array<Record<string, unknown>> = []
  let nextSequence = 1
  let nextPublicationSequence = 1
  let failAfterTrackWrites: number | null = null
  let trackWritesSinceArmed = 0
  let publicationBarrierTarget: number | null = null
  let publicationBarrierArrivals = 0
  let releasePublicationBarrier: (() => void) | null = null
  let publicationBarrier: Promise<void> | null = null

  async function waitAtPublicationBarrier(): Promise<void> {
    if (publicationBarrierTarget === null || publicationBarrier === null) {
      return
    }

    publicationBarrierArrivals += 1
    if (publicationBarrierArrivals === publicationBarrierTarget) {
      releasePublicationBarrier?.()
    }
    await publicationBarrier
  }

  const execute = vi.fn(
    async (query: string, values: unknown[] = []): Promise<unknown> => {
      const sql = normalizedSql(query)

      if (/^INSERT INTO music_folders\b/i.test(sql)) {
        const record = insertedRecord(query, values)
        const rootPath = String(record.root_path)
        const existing = folders.find(
          (folder) => folder.root_path === rootPath,
        )

        if (existing) {
          existing.display_name = String(record.display_name)
        } else {
          folders.push({
            id: String(record.id),
            root_path: rootPath,
            display_name: String(record.display_name),
            selected_at: null,
          })
        }

        return { rowsAffected: 1 }
      }

      if (/^INSERT INTO library_snapshots\b/i.test(sql)) {
        const record = insertedRecord(query, values)
        snapshots.push({
          id: String(record.id),
          music_folder_id: String(record.music_folder_id),
          selected_at: null,
          sequence:
            typeof record.sequence === 'number'
              ? record.sequence
              : nextSequence++,
        })
        return { rowsAffected: 1 }
      }

      if (/^INSERT INTO library_publications\b/i.test(sql)) {
        await waitAtPublicationBarrier()
        const record = insertedRecord(query, values)
        const snapshotId = String(record.library_snapshot_id)
        const folderId = String(record.music_folder_id)
        const folderGeneration = Number(record.folder_generation)
        const snapshot = snapshots.find(({ id }) => id === snapshotId)

        if (!snapshot || snapshot.music_folder_id !== folderId) {
          throw new Error('publication snapshot-folder foreign key conflict')
        }
        if (
          publications.some(
            ({ library_snapshot_id }) => library_snapshot_id === snapshotId,
          )
        ) {
          throw new Error('snapshot publication conflict')
        }
        if (!Number.isInteger(folderGeneration) || folderGeneration < 1) {
          throw new Error(
            'CHECK constraint failed: library_publications.folder_generation',
          )
        }
        if (
          publications.some(
            (publication) =>
              publication.music_folder_id === folderId &&
              publication.folder_generation === folderGeneration,
          )
        ) {
          throw new Error(
            'UNIQUE constraint failed: library_publications.music_folder_id, library_publications.folder_generation',
          )
        }
        if (record.selected_at === null || record.selected_at === undefined) {
          throw new Error('publication selected_at is required')
        }

        publications.push({
          sequence: nextPublicationSequence++,
          library_snapshot_id: snapshotId,
          music_folder_id: folderId,
          folder_generation: folderGeneration,
          selected_at: String(record.selected_at),
        })
        return { rowsAffected: 1 }
      }

      if (/^INSERT INTO track_identities\b/i.test(sql)) {
        const record = insertedRecord(query, values)
        const identity = {
          id: String(record.id),
          music_folder_id: String(record.music_folder_id),
          source: String(record.source),
          source_identifier: String(record.source_identifier),
        }
        const canonical = identities.find(
          (candidate) =>
            candidate.music_folder_id === identity.music_folder_id &&
            candidate.source === identity.source &&
            candidate.source_identifier === identity.source_identifier,
        )

        if (canonical) {
          return { rowsAffected: 0 }
        }

        if (identities.some(({ id }) => id === identity.id)) {
          throw new Error('track identity id conflict')
        }

        identities.push(identity)
        return { rowsAffected: 1 }
      }

      if (/^INSERT INTO tracks\b/i.test(sql)) {
        if (
          failAfterTrackWrites !== null &&
          trackWritesSinceArmed >= failAfterTrackWrites
        ) {
          throw new Error('track write failed')
        }
        trackWritesSinceArmed += 1

        const record = insertedRecord(query, values)
        if ('library_snapshot_id' in record) {
          tracks.push(record)
        } else {
          const existing = tracks.find(
            (track) =>
              track.music_folder_id === record.music_folder_id &&
              track.source === record.source &&
              track.source_identifier === record.source_identifier,
          )

          if (existing) {
            Object.assign(existing, record, { id: existing.id })
          } else {
            tracks.push(record)
          }
        }

        return { rowsAffected: 1 }
      }

      if (/^UPDATE library_snapshots\b/i.test(sql)) {
        const selectedAt = boundValue(
          query,
          values,
          /SET\s+selected_at\s*=\s*\$(\d+)/i,
        )
        const snapshotId = boundValue(
          query,
          values,
          /WHERE\s+(?:id|library_snapshot_id)\s*=\s*\$(\d+)/i,
        )
        const snapshot = snapshots.find(({ id }) => id === snapshotId)

        if (snapshot) {
          snapshot.selected_at = String(selectedAt)
        }
        return { rowsAffected: snapshot ? 1 : 0 }
      }

      // This branch models the superseded ADR 0006 schema so the regression
      // test demonstrates the mixed-generation read produced by the old code.
      if (/^UPDATE music_folders\b/i.test(sql)) {
        const selectedAt = boundValue(
          query,
          values,
          /SET\s+selected_at\s*=\s*\$(\d+)/i,
        )
        const folderId = boundValue(
          query,
          values,
          /WHERE\s+id\s*=\s*\$(\d+)/i,
        )
        const folder = folders.find(({ id }) => id === folderId)

        if (folder) {
          folder.selected_at = String(selectedAt)
        }
        return { rowsAffected: folder ? 1 : 0 }
      }

      throw new Error(`unsupported execute in fake database: ${query}`)
    },
  )

  const select = vi.fn(
    async (query: string, values: unknown[] = []): Promise<unknown> => {
      const sql = normalizedSql(query)

      if (/\bFROM library_publications\b/i.test(sql)) {
        const published = publications
          .filter((publication) => {
            if (!/root_path\s*=\s*\$1/i.test(sql)) {
              return true
            }
            const snapshot = snapshots.find(
              ({ id }) => id === publication.library_snapshot_id,
            )
            const folder = folders.find(
              ({ id }) => id === snapshot?.music_folder_id,
            )
            return folder?.root_path === values[0]
          })
          .sort((left, right) => right.sequence - left.sequence)
        const publication = published[0]

        if (!publication) {
          return []
        }

        const snapshot = snapshots.find(
          ({ id }) => id === publication.library_snapshot_id,
        )
        const folder = folders.find(
          ({ id }) => id === snapshot?.music_folder_id,
        )
        return [
          {
            snapshot_id: snapshot?.id,
            folder_id: folder?.id,
            root_path: folder?.root_path,
            display_name: folder?.display_name,
            selected_at: publication.selected_at,
            sequence: publication.sequence,
            folder_generation: publication.folder_generation,
          },
        ]
      }

      if (/\bFROM library_snapshots\b/i.test(sql)) {
        const published = snapshots
          .filter((snapshot) => snapshot.selected_at !== null)
          .filter((snapshot) => {
            if (!/root_path\s*=\s*\$1/i.test(sql)) {
              return true
            }
            const folder = folders.find(
              ({ id }) => id === snapshot.music_folder_id,
            )
            return folder?.root_path === values[0]
          })
          .sort((left, right) => right.sequence - left.sequence)
        const snapshot = published[0]

        if (!snapshot) {
          return []
        }

        const folder = folders.find(
          ({ id }) => id === snapshot.music_folder_id,
        )
        return [
          {
            id: snapshot.id,
            snapshot_id: snapshot.id,
            library_snapshot_id: snapshot.id,
            folder_id: folder?.id,
            music_folder_id: folder?.id,
            root_path: folder?.root_path,
            display_name: folder?.display_name,
            selected_at: snapshot.selected_at,
            sequence: snapshot.sequence,
          },
        ]
      }

      if (/\bFROM music_folders\b/i.test(sql)) {
        if (/root_path\s*=\s*\$1/i.test(sql)) {
          return folders.filter(({ root_path }) => root_path === values[0])
        }

        return folders
          .filter(({ selected_at }) => selected_at !== null)
          .sort((left, right) =>
            String(right.selected_at).localeCompare(String(left.selected_at)),
          )
          .slice(0, 1)
      }

      if (/\bFROM track_identities\b/i.test(sql)) {
        const musicFolderId = boundValue(
          query,
          values,
          /music_folder_id\s*=\s*\$(\d+)/i,
        )
        const source = boundValue(
          query,
          values,
          /source\s*=\s*\$(\d+)/i,
        )
        const sourceIdentifier = boundValue(
          query,
          values,
          /source_identifier\s*=\s*\$(\d+)/i,
        )

        return identities.filter(
          (identity) =>
            identity.music_folder_id === musicFolderId &&
            identity.source === source &&
            identity.source_identifier === sourceIdentifier,
        )
      }

      if (/\bFROM tracks\b/i.test(sql)) {
        const selectedTracks = /library_snapshot_id\s*=\s*\$1/i.test(sql)
          ? tracks.filter(
              ({ library_snapshot_id }) =>
                library_snapshot_id === values[0],
            )
          : tracks.filter(
              ({ music_folder_id }) => music_folder_id === values[0],
            )
        const snapshot = snapshots.find(({ id }) => id === values[0])

        const hydratedTracks: Array<Record<string, unknown>> =
          selectedTracks.map((track) => ({
            ...track,
            music_folder_id:
              track.music_folder_id ?? snapshot?.music_folder_id,
          }))

        return hydratedTracks.sort((left, right) =>
          String(left.relative_path).localeCompare(
            String(right.relative_path),
          ),
        )
      }

      throw new Error(`unsupported select in fake database: ${query}`)
    },
  )

  return {
    database: { execute, select },
    execute,
    select,
    snapshots,
    publications,
    identities,
    tracks,
    seedFolder(folder: FakeFolderRow) {
      folders.push({ ...folder })
    },
    seedTrackIdentity(identity: FakeTrackIdentityRow) {
      identities.push({ ...identity })
    },
    seedSnapshot(snapshot: FakeSnapshotRow) {
      snapshots.push({ ...snapshot })
      nextSequence = Math.max(nextSequence, snapshot.sequence + 1)
    },
    seedPublication(publication: Omit<FakePublicationRow, 'sequence'>) {
      publications.push({
        ...publication,
        sequence: nextPublicationSequence++,
      })
    },
    seedTrackObservation(track: Record<string, unknown>) {
      tracks.push({ ...track })
    },
    holdPublicationsUntil(attemptCount: number) {
      publicationBarrierTarget = attemptCount
      publicationBarrierArrivals = 0
      publicationBarrier = new Promise<void>((resolve) => {
        releasePublicationBarrier = resolve
      })
    },
    publishedSnapshotIds() {
      if (publications.length > 0) {
        return publications.map(({ library_snapshot_id }) =>
          library_snapshot_id,
        )
      }

      return snapshots
        .filter(({ selected_at }) => selected_at !== null)
        .map(({ id }) => id)
    },
    unpublishedSnapshotIds() {
      const published = new Set(
        publications.length > 0
          ? publications.map(({ library_snapshot_id }) =>
              library_snapshot_id,
            )
          : snapshots
              .filter(({ selected_at }) => selected_at !== null)
              .map(({ id }) => id),
      )

      return snapshots
        .filter(({ id }) => !published.has(id))
        .map(({ id }) => id)
    },
    failSecondTrackWrite() {
      failAfterTrackWrites = 1
      trackWritesSinceArmed = 0
    },
  }
}

describe('library repository writes', () => {
  it('prepares Tracks, samples completion time, and publishes the snapshot last', async () => {
    const operationOrder: string[] = []
    const database = {
      execute: vi.fn(async (query: string, _values: unknown[] = []) => {
        operationOrder.push(
          /INSERT\s+INTO\s+library_publications/i.test(query)
            ? 'publication'
            : /INSERT\s+INTO\s+tracks/i.test(query)
              ? 'track'
              : 'preparation',
        )
        return { rowsAffected: 1 }
      }),
      select: vi.fn(async (query: string): Promise<unknown> =>
        /FROM\s+track_identities/i.test(query)
          ? [
              {
                id: indexedLibrary.tracks[0].id,
                music_folder_id: indexedLibrary.folder.id,
                source: indexedLibrary.tracks[0].source,
                source_identifier:
                  indexedLibrary.tracks[0].sourceIdentifier,
              },
            ]
          : [],
      ),
    }
    const repository = createLibraryRepository(database, {
      now: () => {
        operationOrder.push('completion-time')
        return '2026-09-02T00:00:01.000Z'
      },
    })
    const write = {
      ...indexedLibrary,
      expectedFolderGeneration: 7,
    }

    const result = await repository.saveSelectedLibrary(write)

    const calls = database.execute.mock.calls as Array<[string, unknown[]]>
    const statements = calls.map(([query]) => query)
    const folderWriteIndex = calls.findIndex(([query]) =>
      /INSERT\s+INTO\s+music_folders/i.test(query),
    )
    const snapshotWriteIndex = calls.findIndex(([query]) =>
      /INSERT\s+INTO\s+library_snapshots/i.test(query),
    )
    const trackWriteIndex = calls.findIndex(([query]) =>
      /INSERT\s+INTO\s+tracks/i.test(query),
    )
    const publicationIndex = calls.findIndex(([query]) =>
      /INSERT\s+INTO\s+library_publications/i.test(query),
    )
    const snapshotWrite = calls[snapshotWriteIndex]
    const trackWrite = calls[trackWriteIndex]
    const publication = calls[publicationIndex]

    expect(folderWriteIndex).toBeGreaterThanOrEqual(0)
    expect(snapshotWriteIndex).toBeGreaterThan(folderWriteIndex)
    expect(trackWriteIndex).toBeGreaterThan(snapshotWriteIndex)
    expect(publicationIndex).toBeGreaterThan(trackWriteIndex)
    expect(publicationIndex).toBe(calls.length - 1)
    expect(snapshotWrite?.[0]).not.toMatch(/\bselected_at\b/i)
    expect(snapshotWrite?.[0]).not.toMatch(/\bsequence\b/i)
    expect(snapshotWrite?.[1]).not.toContain(indexedLibrary.selectedAt)
    expect(trackWrite?.[0]).toMatch(/\blibrary_snapshot_id\b/i)
    const preparedSnapshotId = snapshotWrite?.[1].find(
      (value) =>
        typeof value === 'string' &&
        value !== indexedLibrary.folder.id &&
        value !== indexedLibrary.folder.rootPath &&
        value !== indexedLibrary.folder.displayName,
    )
    expect(preparedSnapshotId).toEqual(expect.any(String))
    expect(trackWrite?.[1]).toContain(preparedSnapshotId)
    expect(publication?.[0]).toMatch(/INSERT\s+INTO\s+library_publications/i)
    expect(publication?.[0]).toMatch(/\blibrary_snapshot_id\b/i)
    expect(publication?.[0]).toMatch(/\bmusic_folder_id\b/i)
    expect(publication?.[0]).toMatch(/\bfolder_generation\b/i)
    expect(publication?.[0]).toMatch(/\bselected_at\b/i)
    expect(publication?.[1]).toContain('2026-09-02T00:00:01.000Z')
    expect(operationOrder.slice(-3)).toEqual([
      'track',
      'completion-time',
      'publication',
    ])
    expect(result.selectedAt).toBe('2026-09-02T00:00:01.000Z')
    expect(publication?.[1]).toContain(preparedSnapshotId)
    expect(publication?.[1]).toContain(indexedLibrary.folder.id)
    expect(publication?.[1]).toContain(8)
    expect(publication?.[1]).not.toContain(7)
    expect(
      calls.filter(([query]) =>
        /INSERT\s+INTO\s+library_publications/i.test(query),
      ),
    ).toHaveLength(1)
    expect(statements.join('\n')).not.toMatch(
      /UPDATE\s+music_folders[\s\S]*selected_at/i,
    )
    expect(statements.join('\n')).not.toMatch(
      /UPDATE\s+library_snapshots[\s\S]*selected_at/i,
    )
    expect(statements.join('\n')).not.toContain(
      '/Private/Reference Music/session/take.FLAC',
    )
    expect(statements.join('\n')).not.toMatch(/\bDELETE\b/i)
  })

  it('resolves canonical Track identities before observations and returns their mapping', async () => {
    const fake = createStatefulLibraryDatabase()
    fake.seedFolder({
      id: indexedLibrary.folder.id,
      root_path: indexedLibrary.folder.rootPath,
      display_name: indexedLibrary.folder.displayName,
      selected_at: null,
    })
    fake.seedTrackIdentity({
      id: 'track-canonical',
      music_folder_id: indexedLibrary.folder.id,
      source: 'local',
      source_identifier: indexedLibrary.tracks[0].sourceIdentifier,
    })
    const repository = createLibraryRepository(fake.database, {
      now: () => indexedLibrary.selectedAt,
    })
    const proposedLibrary = {
      ...indexedLibrary,
      tracks: indexedLibrary.tracks.map((track) => ({
        ...track,
        id: 'track-proposed-by-this-operation',
      })),
    }

    const result = await repository.saveSelectedLibrary(proposedLibrary)
    const executeCalls = fake.execute.mock.calls as Array<
      [string, unknown[]]
    >
    const identityWriteIndex = executeCalls.findIndex(([query]) =>
      /INSERT\s+INTO\s+track_identities/i.test(query),
    )
    const observationWriteIndex = executeCalls.findIndex(([query]) =>
      /INSERT\s+INTO\s+tracks/i.test(query),
    )
    const observationWrite = executeCalls[observationWriteIndex]

    expect(identityWriteIndex).toBeGreaterThanOrEqual(0)
    expect(observationWriteIndex).toBeGreaterThan(identityWriteIndex)
    expect(
      fake.select.mock.calls.some(([query]) =>
        /FROM\s+track_identities[\s\S]*music_folder_id[\s\S]*source_identifier/i.test(
          String(query),
        ),
      ),
    ).toBe(true)
    expect(observationWrite?.[1]).toContain('track-canonical')
    expect(observationWrite?.[1]).not.toContain(
      'track-proposed-by-this-operation',
    )
    expect(result).toEqual({
      folderId: indexedLibrary.folder.id,
      selectedAt: indexedLibrary.selectedAt,
      trackIdsBySourceIdentifier: {
        [indexedLibrary.tracks[0].sourceIdentifier]: 'track-canonical',
      },
    })
  })

  it('keeps the previous published snapshot readable when a rescan fails midway', async () => {
    const fake = createStatefulLibraryDatabase()
    const repository = createLibraryRepository(fake.database, {
      now: () => indexedLibrary.selectedAt,
    })
    const firstWrite = {
      ...indexedLibrary,
      tracks: [
        {
          ...indexedLibrary.tracks[0],
          title: 'Published take',
        },
        {
          ...indexedLibrary.tracks[0],
          id: 'track-2',
          sourceIdentifier: 'session/other.FLAC',
          path: '/Private/Reference Music/session/other.FLAC',
          relativePath: 'session/other.FLAC',
          fileName: 'other.FLAC',
          title: 'Published other',
        },
      ],
      selectedAt: '2026-09-02T00:00:00.000Z',
    }
    const failedRescan = {
      ...firstWrite,
      tracks: firstWrite.tracks.map((track) => ({
        ...track,
        title: `Unpublished ${track.title}`,
        updatedAt: '2026-09-02T01:00:00.000Z',
      })),
      selectedAt: '2026-09-02T01:00:00.000Z',
      expectedFolderGeneration: 1,
    }

    await repository.saveSelectedLibrary(firstWrite)
    fake.failSecondTrackWrite()
    await expect(
      repository.saveSelectedLibrary(failedRescan),
    ).rejects.toThrow('track write failed')

    await expect(repository.loadSelectedLibrary()).resolves.toMatchObject({
      folder: {
        rootPath: '/Private/Reference Music',
        selectedAt: '2026-09-02T00:00:00.000Z',
      },
      tracks: [
        { id: 'track-2', title: 'Published other' },
        { id: 'track-1', title: 'Published take' },
      ],
    })
    expect(fake.publishedSnapshotIds()).toHaveLength(1)
    expect(fake.unpublishedSnapshotIds()).toHaveLength(1)
  })

  it('rejects the second generation-one publication prepared from the same root base', async () => {
    const fake = createStatefulLibraryDatabase()
    const repository = createLibraryRepository(fake.database, {
      now: () => indexedLibrary.selectedAt,
    })
    const firstWrite = {
      ...indexedLibrary,
      tracks: indexedLibrary.tracks.map((track) => ({
        ...track,
        title: 'First publication',
      })),
      expectedFolderGeneration: 0,
    }
    const staleWrite = {
      ...indexedLibrary,
      folder: {
        ...indexedLibrary.folder,
        id: 'folder-stale-proposal',
      },
      tracks: indexedLibrary.tracks.map((track) => ({
        ...track,
        id: 'track-stale-proposal',
        musicFolderId: 'folder-stale-proposal',
        title: 'Stale publication',
      })),
      selectedAt: '2026-09-02T00:01:00.000Z',
      expectedFolderGeneration: 0,
    }

    fake.holdPublicationsUntil(2)
    const [firstResult, staleResult] = await Promise.allSettled([
      repository.saveSelectedLibrary(firstWrite),
      repository.saveSelectedLibrary(staleWrite),
    ])

    expect(firstResult.status).toBe('fulfilled')
    expect(staleResult.status).toBe('rejected')
    if (staleResult.status === 'rejected') {
      expect(String(staleResult.reason)).toMatch(
        /UNIQUE constraint failed:[\s\S]*music_folder_id[\s\S]*folder_generation/i,
      )
    }
    expect(fake.snapshots).toHaveLength(2)
    expect(fake.publications).toMatchObject([
      {
        music_folder_id: indexedLibrary.folder.id,
        folder_generation: 1,
      },
    ])
    await expect(repository.loadSelectedLibrary()).resolves.toMatchObject({
      folderGeneration: 1,
      folder: {
        id: indexedLibrary.folder.id,
        selectedAt: indexedLibrary.selectedAt,
      },
      tracks: [{ title: 'First publication' }],
    })
  })

  it('allows different roots to publish the same folder generation', async () => {
    const fake = createStatefulLibraryDatabase()
    const repository = createLibraryRepository(fake.database)
    const firstRoot = {
      ...indexedLibrary,
      folder: {
        id: 'folder-one',
        rootPath: '/Fixture/Root One',
        displayName: 'Root One',
      },
      tracks: indexedLibrary.tracks.map((track) => ({
        ...track,
        id: 'track-one',
        musicFolderId: 'folder-one',
        sourceIdentifier: 'one.wav',
        path: '/Fixture/Root One/one.wav',
        relativePath: 'one.wav',
        fileName: 'one.wav',
        title: 'One',
      })),
      expectedFolderGeneration: 0,
    }
    const secondRoot = {
      ...indexedLibrary,
      folder: {
        id: 'folder-two',
        rootPath: '/Fixture/Root Two',
        displayName: 'Root Two',
      },
      tracks: indexedLibrary.tracks.map((track) => ({
        ...track,
        id: 'track-two',
        musicFolderId: 'folder-two',
        sourceIdentifier: 'two.wav',
        path: '/Fixture/Root Two/two.wav',
        relativePath: 'two.wav',
        fileName: 'two.wav',
        title: 'Two',
      })),
      selectedAt: '2026-09-02T00:01:00.000Z',
      expectedFolderGeneration: 0,
    }

    await expect(repository.saveSelectedLibrary(firstRoot)).resolves.toMatchObject(
      {
        folderId: 'folder-one',
      },
    )
    await expect(
      repository.saveSelectedLibrary(secondRoot),
    ).resolves.toMatchObject({ folderId: 'folder-two' })

    expect(fake.publications).toMatchObject([
      { music_folder_id: 'folder-one', folder_generation: 1 },
      { music_folder_id: 'folder-two', folder_generation: 1 },
    ])
    await expect(
      repository.loadLibraryByRootPath('/Fixture/Root One'),
    ).resolves.toMatchObject({
      folderGeneration: 1,
      folder: { id: 'folder-one' },
    })
    await expect(
      repository.loadLibraryByRootPath('/Fixture/Root Two'),
    ).resolves.toMatchObject({
      folderGeneration: 1,
      folder: { id: 'folder-two' },
    })
  })
})

describe('library repository reads', () => {
  it('returns the last inserted publication when snapshot and clock order point elsewhere', async () => {
    const fake = createStatefulLibraryDatabase()
    fake.seedFolder({
      id: 'folder-order',
      root_path: '/Fixture/Publication Order',
      display_name: 'Publication Order',
      selected_at: null,
    })

    // These legacy fields make the superseded snapshot-ordered read choose B.
    fake.seedSnapshot({
      id: 'snapshot-a',
      music_folder_id: 'folder-order',
      selected_at: '2000-01-01T00:00:00.000Z',
      sequence: 1,
    })
    fake.seedSnapshot({
      id: 'snapshot-b',
      music_folder_id: 'folder-order',
      selected_at: '2099-01-01T00:00:00.000Z',
      sequence: 2,
    })
    fake.seedTrackObservation({
      library_snapshot_id: 'snapshot-a',
      id: 'track-a',
      music_folder_id: 'folder-order',
      source: 'local',
      source_identifier: 'prepared-a.wav',
      path: '/Fixture/Publication Order/prepared-a.wav',
      relative_path: 'prepared-a.wav',
      file_name: 'prepared-a.wav',
      format: 'wav',
      title: 'Prepared A',
      artist: null,
      album: null,
      duration_ms: null,
      metadata_status: 'fallback',
      updated_at: '2026-09-02T12:00:00.000Z',
    })
    fake.seedTrackObservation({
      library_snapshot_id: 'snapshot-b',
      id: 'track-b',
      music_folder_id: 'folder-order',
      source: 'local',
      source_identifier: 'prepared-b.wav',
      path: '/Fixture/Publication Order/prepared-b.wav',
      relative_path: 'prepared-b.wav',
      file_name: 'prepared-b.wav',
      format: 'wav',
      title: 'Prepared B',
      artist: null,
      album: null,
      duration_ms: null,
      metadata_status: 'fallback',
      updated_at: '2026-09-02T12:01:00.000Z',
    })

    // Seed successive generations directly to isolate the read-order contract.
    // Concurrent same-base rejection is exercised by the write test above.
    fake.seedPublication({
      library_snapshot_id: 'snapshot-b',
      music_folder_id: 'folder-order',
      folder_generation: 1,
      selected_at: '2099-01-01T00:00:00.000Z',
    })
    fake.seedPublication({
      library_snapshot_id: 'snapshot-a',
      music_folder_id: 'folder-order',
      folder_generation: 2,
      selected_at: '2000-01-01T00:00:00.000Z',
    })

    const repository = createLibraryRepository(fake.database)

    await expect(repository.loadSelectedLibrary()).resolves.toMatchObject({
      folderGeneration: 2,
      folder: {
        id: 'folder-order',
        selectedAt: '2000-01-01T00:00:00.000Z',
      },
      tracks: [{ id: 'track-a', title: 'Prepared A' }],
    })
    expect(fake.select).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(
        /FROM\s+library_publications\s+AS\s+publications[\s\S]*ORDER\s+BY\s+publications\.sequence\s+DESC/i,
      ),
    )
  })

  it('loads only the latest published snapshot and its snapshot-scoped Tracks', async () => {
    const database = {
      execute: vi.fn(),
      select: vi
        .fn()
        .mockResolvedValueOnce([
          {
            snapshot_id: 'snapshot-2',
            folder_id: 'folder-2',
            root_path: '/Remembered/Second',
            display_name: 'Second',
            selected_at: '2026-09-02T00:00:00.000Z',
            sequence: 2,
            folder_generation: 2,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'track-2',
            library_snapshot_id: 'snapshot-2',
            music_folder_id: 'folder-2',
            source: 'local',
            source_identifier: 'set/song.mp3',
            path: '/Remembered/Second/set/song.mp3',
            relative_path: 'set/song.mp3',
            file_name: 'song.mp3',
            format: 'mp3',
            title: null,
            artist: null,
            album: null,
            duration_ms: null,
            metadata_status: 'fallback',
            updated_at: '2026-09-02T00:00:00.000Z',
          },
        ]),
    }
    const repository = createLibraryRepository(database)

    await expect(repository.loadSelectedLibrary()).resolves.toEqual({
      folderGeneration: 2,
      folder: {
        id: 'folder-2',
        rootPath: '/Remembered/Second',
        displayName: 'Second',
        selectedAt: '2026-09-02T00:00:00.000Z',
      },
      tracks: [
        {
          id: 'track-2',
          musicFolderId: 'folder-2',
          source: 'local',
          sourceIdentifier: 'set/song.mp3',
          path: '/Remembered/Second/set/song.mp3',
          relativePath: 'set/song.mp3',
          fileName: 'song.mp3',
          format: 'mp3',
          title: 'song',
          artist: null,
          album: null,
          durationMs: null,
          metadataStatus: 'fallback',
          updatedAt: '2026-09-02T00:00:00.000Z',
        },
      ],
    })

    expect(database.execute).not.toHaveBeenCalled()
    expect(database.select).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(
        /FROM\s+library_publications\s+AS\s+publications[\s\S]*JOIN\s+library_snapshots\s+AS\s+snapshots[\s\S]*JOIN\s+music_folders\s+AS\s+folders[\s\S]*ORDER\s+BY\s+publications\.sequence\s+DESC[\s\S]*LIMIT\s+1/i,
      ),
    )
    expect(String(database.select.mock.calls[0]?.[0])).toMatch(
      /publications\.selected_at/i,
    )
    expect(String(database.select.mock.calls[0]?.[0])).toMatch(
      /publications\.folder_generation/i,
    )
    expect(String(database.select.mock.calls[0]?.[0])).not.toMatch(
      /ORDER\s+BY\s+[\s\S]*selected_at/i,
    )
    expect(database.select).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/WHERE\s+library_snapshot_id\s*=\s*\$1/i),
      ['snapshot-2'],
    )
  })

  it('filters by root path before taking the latest publication for that folder', async () => {
    const database = {
      execute: vi.fn(),
      select: vi.fn().mockResolvedValueOnce([]),
    }
    const repository = createLibraryRepository(database)

    await expect(
      repository.loadLibraryByRootPath('/Remembered/Second'),
    ).resolves.toBeNull()

    expect(database.select).toHaveBeenCalledOnce()
    expect(database.select).toHaveBeenCalledWith(
      expect.stringMatching(
        /FROM\s+library_publications\s+AS\s+publications[\s\S]*JOIN\s+library_snapshots\s+AS\s+snapshots[\s\S]*JOIN\s+music_folders\s+AS\s+folders[\s\S]*WHERE\s+folders\.root_path\s*=\s*\$1[\s\S]*ORDER\s+BY\s+publications\.sequence\s+DESC[\s\S]*LIMIT\s+1/i,
      ),
      ['/Remembered/Second'],
    )
    expect(database.execute).not.toHaveBeenCalled()
  })

  it('returns no library without querying Tracks when no snapshot is published', async () => {
    const database = {
      execute: vi.fn(),
      select: vi.fn().mockResolvedValueOnce([]),
    }
    const repository = createLibraryRepository(database)

    await expect(repository.loadSelectedLibrary()).resolves.toBeNull()
    expect(database.select).toHaveBeenCalledOnce()
    expect(database.select).toHaveBeenCalledWith(
      expect.stringMatching(
        /FROM\s+library_publications\s+AS\s+publications[\s\S]*ORDER\s+BY\s+publications\.sequence\s+DESC/i,
      ),
    )
    expect(database.execute).not.toHaveBeenCalled()
  })
})
