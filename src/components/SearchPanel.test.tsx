import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { SearchGateway, SearchResult } from '../lib/search-repository'
import SearchPanel from './SearchPanel'

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'marker-1',
    kind: 'marker',
    trackId: 'track-1',
    title: '灯り',
    artist: 'Fixture Artist',
    album: null,
    excerpt: 'ゴーストノートを聴く',
    createdAt: '2026-09-02T12:00:00.000Z',
    positionMs: 42_500,
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe('SearchPanel Story 0008 contract', () => {
  it('rejects long input with fixed copy and never searches blank input', async () => {
    const user = userEvent.setup()
    const gateway: SearchGateway = { searchNotes: vi.fn().mockResolvedValue([]) }
    render(<SearchPanel gateway={gateway} onOpenResult={vi.fn()} />)

    const input = screen.getByRole('searchbox', { name: '過去の耳を検索' })
    const submit = screen.getByRole('button', { name: '検索' })
    expect(submit).toBeDisabled()
    await user.type(input, '   ')
    expect(submit).toBeDisabled()
    expect(gateway.searchNotes).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, '耳'.repeat(101))
    expect(submit).toBeDisabled()
    expect(
      screen.getByRole('alert', { name: '検索文字数エラー' }),
    ).toHaveTextContent('検索は100文字以内で入力してください。')
    expect(document.body.textContent).not.toContain('/private/')
  })

  it('shows loading and moves focus to the first safe result', async () => {
    const user = userEvent.setup()
    const pending = deferred<SearchResult[]>()
    const gateway: SearchGateway = { searchNotes: vi.fn(() => pending.promise) }
    const onOpenResult = vi.fn()
    render(<SearchPanel gateway={gateway} onOpenResult={onOpenResult} />)

    await user.type(
      screen.getByRole('searchbox', { name: '過去の耳を検索' }),
      'ゴースト',
    )
    await user.click(screen.getByRole('button', { name: '検索' }))
    expect(screen.getByRole('status', { name: '検索状態' })).toHaveTextContent(
      '検索しています',
    )

    await act(async () => pending.resolve([result()]))

    const open = await screen.findByRole('button', {
      name: 'Marker「灯り」42秒を開く',
    })
    expect(open).toHaveFocus()
    expect(screen.getByText('ゴーストノートを聴く')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('/private/')
    await user.click(open)
    expect(onOpenResult).toHaveBeenCalledWith(result())
  })

  it('ignores a stale response after the query changes and reports zero and failure states', async () => {
    const user = userEvent.setup()
    const stale = deferred<SearchResult[]>()
    const gateway: SearchGateway = {
      searchNotes: vi
        .fn()
        .mockReturnValueOnce(stale.promise)
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('/private/library.db SELECT *')),
    }
    render(<SearchPanel gateway={gateway} onOpenResult={vi.fn()} />)
    const input = screen.getByRole('searchbox', { name: '過去の耳を検索' })

    await user.type(input, '古い')
    await user.click(screen.getByRole('button', { name: '検索' }))
    await user.clear(input)
    await user.type(input, '新しい')
    await user.click(screen.getByRole('button', { name: '検索' }))
    expect(
      await screen.findByRole('status', { name: '検索結果なし' }),
    ).toHaveTextContent('見つかりませんでした')

    await act(async () => stale.resolve([result({ excerpt: '古い結果' })]))
    expect(screen.queryByText('古い結果')).toBeNull()

    await user.clear(input)
    await user.type(input, '失敗')
    await user.click(screen.getByRole('button', { name: '検索' }))
    expect(
      await screen.findByRole('alert', { name: '検索エラー' }),
    ).toHaveTextContent('検索できませんでした。もう一度試してください。')
    expect(document.body.textContent).not.toContain('/private/')
    expect(document.body.textContent).not.toContain('SELECT *')
  })
})
