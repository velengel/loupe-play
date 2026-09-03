/// <reference types="node" />

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const styles = readFileSync('src/styles.css', 'utf8')

describe('Story 0011 responsive affordance contracts', () => {
  it('makes playback time prominent and keeps arbitrary now-playing text shrinkable', () => {
    expect(styles).toMatch(
      /\.listen-time-current\s*\{[^}]*font-size:\s*clamp\(/s,
    )
    expect(styles).toMatch(
      /\.listen-now-playing-copy\s*\{[^}]*min-width:\s*0/s,
    )
    expect(styles).toMatch(
      /\.listen-now-playing h5\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s,
    )
  })

  it('gives source and transport actions 44px targets with visible keyboard focus', () => {
    expect(styles).toMatch(
      /\.library-source-button\s*\{[^}]*min-height:\s*2\.75rem/s,
    )
    expect(styles).toMatch(
      /\.listen-transport button\s*\{[^}]*min-height:\s*2\.75rem/s,
    )
    expect(styles).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*3px solid #ffc46b[^}]*outline-offset:\s*3px/s,
    )
  })

  it('stacks source actions and time below the title at the 320px layout breakpoint', () => {
    const narrowRules = styles.match(/@media \(max-width: 420px\)\s*\{[\s\S]*\n\}/)?.[0]

    expect(narrowRules).toContain('.library-source-actions')
    expect(narrowRules).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(narrowRules).toMatch(
      /\.library-source-actions\s*\{[^}]*flex-basis:\s*auto/s,
    )
    expect(narrowRules).toContain('.listen-now-playing')
    expect(narrowRules).toContain('flex-direction: column')
  })
})
