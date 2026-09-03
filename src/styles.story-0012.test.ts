/// <reference types="node" />

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const styles = readFileSync('src/styles.css', 'utf8')

describe('Story 0012 help and Note context layout', () => {
  it('keeps header actions and Note context shrinkable with 44px targets', () => {
    expect(styles).toMatch(/\.header-actions\s*\{[^}]*min-width:\s*0/s)
    expect(styles).toMatch(
      /\.help-button\s*\{[^}]*min-width:\s*2\.75rem[^}]*min-height:\s*2\.75rem/s,
    )
    expect(styles).toMatch(/\.note-context\s*\{[^}]*min-width:\s*0/s)
    expect(styles).toMatch(
      /\.note-context-button\s*\{[^}]*min-height:\s*2\.75rem[^}]*overflow-wrap:\s*anywhere/s,
    )
  })

  it('bounds and scrolls the native dialog inside the viewport', () => {
    expect(styles).toMatch(
      /\.help-dialog\s*\{[^}]*width:\s*min\([^}]*max-height:\s*calc\(100dvh\s*-\s*2rem\)[^}]*overflow:\s*hidden/s,
    )
    expect(styles).toMatch(
      /\.help-dialog-content\s*\{[^}]*min-width:\s*0[^}]*overflow-y:\s*auto/s,
    )
    expect(styles).toMatch(
      /\.help-dialog::backdrop\s*\{[^}]*background:/s,
    )
  })

  it('preserves dialog margin and stacked header actions at 320px', () => {
    const narrowRules = styles.match(/@media \(max-width: 420px\)\s*\{[\s\S]*\n\}/)?.[0]

    expect(narrowRules).toMatch(
      /\.header-actions\s*\{[^}]*width:\s*100%[^}]*justify-content:\s*space-between/s,
    )
    expect(narrowRules).toMatch(
      /\.help-dialog\s*\{[^}]*width:\s*calc\(100%\s*-\s*1rem\)/s,
    )
  })
})
