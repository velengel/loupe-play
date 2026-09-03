import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import type {
  SearchGateway,
  SearchResult,
  SearchResultKind,
} from '../lib/search-repository'

interface SearchPanelProps {
  gateway: SearchGateway
  onOpenResult: (result: SearchResult) => void
}

const kindLabels: Record<SearchResultKind, string> = {
  track: 'Track',
  'track-note': 'Track Note',
  'listening-note': 'Listening Note',
  marker: 'Marker',
}

function formatPosition(positionMs: number): string {
  const seconds = Math.floor(positionMs / 1_000)
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function resultLabel(result: SearchResult): string {
  const position =
    result.kind === 'marker' && result.positionMs !== null
      ? `${Math.floor(result.positionMs / 1_000)}秒`
      : ''
  return `${kindLabels[result.kind]}「${result.title}」${position}を開く`
}

function SearchPanel({ gateway, onOpenResult }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const requestSequenceRef = useRef(0)
  const focusResultRef = useRef(false)
  const firstResultRef = useRef<HTMLButtonElement | null>(null)
  const trimmedQuery = query.trim()
  const tooLong = [...trimmedQuery].length > 100
  const canSearch = trimmedQuery.length > 0 && !tooLong && !loading

  useEffect(() => {
    if (focusResultRef.current && results && results.length > 0) {
      focusResultRef.current = false
      firstResultRef.current?.focus({ preventScroll: true })
    }
  }, [results])

  useEffect(
    () => () => {
      requestSequenceRef.current += 1
    },
    [],
  )

  function changeQuery(value: string) {
    requestSequenceRef.current += 1
    focusResultRef.current = false
    setQuery(value)
    setResults(null)
    setFailed(false)
    setLoading(false)
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSearch) return

    const requestId = ++requestSequenceRef.current
    setLoading(true)
    setFailed(false)
    setResults(null)

    try {
      const found = await gateway.searchNotes(trimmedQuery)
      if (requestSequenceRef.current !== requestId) return
      focusResultRef.current = found.length > 0
      setResults(found)
    } catch {
      if (requestSequenceRef.current !== requestId) return
      setFailed(true)
    } finally {
      if (requestSequenceRef.current === requestId) setLoading(false)
    }
  }

  return (
    <section className="search-panel" aria-labelledby="note-search-title">
      <div className="search-panel-heading">
        <div>
          <p className="card-kicker">Find your listening</p>
          <h5 id="note-search-title">過去の耳を探す</h5>
        </div>
      </div>
      <form role="search" aria-label="メモ検索" onSubmit={submitSearch}>
        <label>
          <span>過去の耳を検索</span>
          <input
            type="search"
            value={query}
            onChange={(event) => changeQuery(event.currentTarget.value)}
          />
        </label>
        <button type="submit" disabled={!canSearch}>
          検索
        </button>
      </form>

      {tooLong ? (
        <p className="inline-error" role="alert" aria-label="検索文字数エラー">
          検索は100文字以内で入力してください。
        </p>
      ) : null}
      {loading ? (
        <p role="status" aria-label="検索状態">
          検索しています…
        </p>
      ) : null}
      {failed ? (
        <p className="inline-error" role="alert" aria-label="検索エラー">
          検索できませんでした。もう一度試してください。
        </p>
      ) : null}
      {results?.length === 0 && !loading && !failed ? (
        <p role="status" aria-label="検索結果なし">
          一致するメモは見つかりませんでした。
        </p>
      ) : null}
      {results && results.length > 0 ? (
        <ol className="search-results" aria-label="検索結果">
          {results.map((result, index) => (
            <li key={`${result.kind}:${result.id}`}>
              <button
                ref={index === 0 ? firstResultRef : undefined}
                type="button"
                aria-label={resultLabel(result)}
                onClick={() => onOpenResult(result)}
              >
                <span className="search-result-kind">
                  {kindLabels[result.kind]}
                </span>
                <strong>{result.title}</strong>
                {result.artist || result.album ? (
                  <span className="search-result-meta">
                    {[result.artist, result.album].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
                <span className="search-result-excerpt">{result.excerpt}</span>
                <span className="search-result-foot">
                  <time dateTime={result.createdAt}>{result.createdAt}</time>
                  {result.kind === 'marker' && result.positionMs !== null ? (
                    <span>{formatPosition(result.positionMs)}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}

export default SearchPanel
