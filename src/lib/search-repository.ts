import searchCurrentPublication from './search-current-publication.sql?raw'

interface SearchDatabase {
  select: (query: string, bindValues?: unknown[]) => Promise<unknown>
}

interface DatabaseRow {
  [key: string]: unknown
}

export type SearchResultKind =
  | 'track'
  | 'track-note'
  | 'listening-note'
  | 'marker'

export interface SearchResult {
  id: string
  kind: SearchResultKind
  trackId: string
  title: string
  artist: string | null
  album: string | null
  excerpt: string
  createdAt: string
  positionMs: number | null
}

export interface SearchGateway {
  searchNotes: (query: string) => Promise<SearchResult[]>
}

export class SearchQueryTooLongError extends Error {
  constructor() {
    super('Search query must contain no more than 100 code points')
    this.name = 'SearchQueryTooLongError'
  }
}

const resultKinds = new Set<SearchResultKind>([
  'track',
  'track-note',
  'listening-note',
  'marker',
])

function rowsFrom(value: unknown): DatabaseRow[] {
  return Array.isArray(value) ? (value as DatabaseRow[]) : []
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function resultFromRow(row: DatabaseRow): SearchResult {
  const kind = row.kind
  const positionMs = row.position_ms
  if (
    typeof kind !== 'string' ||
    !resultKinds.has(kind as SearchResultKind) ||
    (positionMs !== null &&
      positionMs !== undefined &&
      (typeof positionMs !== 'number' ||
        !Number.isSafeInteger(positionMs) ||
        positionMs < 0)) ||
    (kind === 'marker' && typeof positionMs !== 'number') ||
    (kind !== 'marker' && positionMs !== null && positionMs !== undefined)
  ) {
    throw new Error('Stored search result is invalid')
  }

  return {
    id: String(row.id),
    kind: kind as SearchResultKind,
    trackId: String(row.track_id),
    title: String(row.title),
    artist: nullableText(row.artist),
    album: nullableText(row.album),
    excerpt: String(row.excerpt),
    createdAt: String(row.created_at),
    positionMs: typeof positionMs === 'number' ? positionMs : null,
  }
}

function literalPattern(query: string): string {
  const escaped = query
    .replaceAll('!', '!!')
    .replaceAll('%', '!%')
    .replaceAll('_', '!_')
  return `%${escaped}%`
}

export function createSearchRepository(
  database: SearchDatabase,
): SearchGateway {
  return {
    async searchNotes(rawQuery): Promise<SearchResult[]> {
      const query = rawQuery.trim()
      if (query.length === 0) return []
      if ([...query].length > 100) throw new SearchQueryTooLongError()

      const rows = await database.select(searchCurrentPublication, [
        literalPattern(query),
      ])
      return rowsFrom(rows).map(resultFromRow)
    },
  }
}
