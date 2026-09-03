import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

function readRepositoryFile(relativePath: string): string {
  const path = resolve(process.cwd(), relativePath)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

describe('pre-implementation understanding gate contract', () => {
  it('places the gate after intent records and before the RED test', () => {
    const agents = readRepositoryFile('AGENTS.md')
    const requiredOrder = agents.slice(
      agents.indexOf('## 必須の作業順序'),
      agents.indexOf('## 開発コマンド'),
    )
    const storyIndex = requiredOrder.indexOf('docs/story/')
    const adrIndex = requiredOrder.indexOf('docs/ADR/')
    const gateIndex = requiredOrder.indexOf(
      'docs/development/implementation-understanding-gate.md',
    )
    const redIndex = requiredOrder.indexOf('失敗を確認してから')

    expect(storyIndex).toBeGreaterThanOrEqual(0)
    expect(adrIndex).toBeGreaterThan(storyIndex)
    expect(gateIndex).toBeGreaterThan(adrIndex)
    expect(redIndex).toBeGreaterThan(gateIndex)
  })

  it('requires self-explanation for important changes without ritual questions', () => {
    const agents = readRepositoryFile('AGENTS.md')

    expect(agents).toContain('最大3問')
    expect(agents).toContain('利用者自身の言葉')
    expect(agents).toContain('Passed')
    expect(agents).toContain('Skipped')
    expect(agents).toContain('Blocked')
    expect(agents).toContain('依頼文や直前の会話')
    expect(agents).toContain('同じ質問を繰り返さない')
  })

  it('keeps one operational source of truth and a reusable Story entry', () => {
    const gate = readRepositoryFile(
      'docs/development/implementation-understanding-gate.md',
    )
    const storyTemplate = readRepositoryFile('docs/templates/story.md')

    expect(gate).not.toBe('')
    expect(gate).toContain('## 適用判定')
    expect(gate).toContain('## Codexが先に説明すること')
    expect(gate).toContain('## 利用者へ尋ねること')
    expect(gate).toContain('## 判定と記録')
    expect(gate).toContain('## Storyへの記録形式')
    expect(gate).toContain('## 例')
    expect(gate).toContain('RED testを始めない')

    expect(storyTemplate).not.toBe('')
    expect(storyTemplate).toContain('## Context（背景）')
    expect(storyTemplate).toContain('## Definition of Done（完了の定義）')
    expect(storyTemplate).toContain('## To Do（やること）')
    expect(storyTemplate).toContain('## Concern（懸念）')
    expect(storyTemplate).toContain(
      '## Understanding Gate（実装前理解確認）',
    )
    expect(storyTemplate).toContain('- Status:')
    expect(storyTemplate).toContain('- Reason:')
    expect(storyTemplate).toContain('- Questions:')
    expect(storyTemplate).toContain('- User explanation:')
    expect(storyTemplate).toContain('- Misalignment / Resolution:')
    expect(storyTemplate).toContain('- Unresolved:')
  })

  it('connects developer-facing entry points to the canonical gate', () => {
    const readme = readRepositoryFile('README.md')
    const language = readRepositoryFile('docs/ubiquitous-language.md')
    const canonicalPath =
      'docs/development/implementation-understanding-gate.md'

    expect(readme).toContain(`[実装前理解確認ゲート](${canonicalPath})`)
    expect(language).toContain('## 実装前理解確認ゲート')
    expect(language).toContain(
      '[運用の正本](development/implementation-understanding-gate.md)',
    )
  })
})
