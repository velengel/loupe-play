import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

function declarations(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))

  expect(match, `missing CSS rule for ${selector}`).not.toBeNull()
  return match?.[1] ?? ''
}

describe('responsive layout contract', () => {
  it('bounds the wide layout while retaining a 320px floor', () => {
    expect(declarations('html')).toContain('min-width: 320px')
    expect(declarations('.app-shell')).toContain(
      'width: min(100%, 1440px)',
    )
    expect(css).toContain('@media (max-width: 760px)')
    expect(css).toContain('@media (max-width: 420px)')
  })

  it.each(['.folder-path', '.track-name'])(
    'contains arbitrary text in %s',
    (selector) => {
      const rule = declarations(selector)

      expect(rule).toContain('overflow: hidden')
      expect(rule).toContain('text-overflow: ellipsis')
      expect(rule).toContain('white-space: nowrap')
    },
  )

  it('keeps the track focus ring inside its scroll container', () => {
    expect(declarations('.track-button:focus-visible')).toContain(
      'outline-offset: -3px',
    )
  })

  it('stacks audio recovery controls at phone width', () => {
    const phoneRules = css.slice(css.indexOf('@media (max-width: 420px)'))

    expect(phoneRules).toMatch(
      /\.audio-feedback\s*\{[^}]*flex-direction:\s*column/s,
    )
    expect(phoneRules).toMatch(
      /\.app-shell\s*\{[^}]*padding-inline:\s*1rem/s,
    )
  })

  it('keeps the Listen player shrinkable with touch-sized controls', () => {
    expect(declarations('.listen-player')).toContain('min-width: 0')
    expect(declarations('.listen-now-playing > div')).toContain('min-width: 0')
    expect(declarations('.listen-now-playing h5')).toContain('overflow: hidden')
    expect(declarations('.listen-now-playing h5')).toContain(
      'text-overflow: ellipsis',
    )
    expect(declarations('.listen-transport')).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr))',
    )
    expect(declarations('.listen-transport button')).toContain(
      'min-height: 2.75rem',
    )
    expect(declarations('.listen-player input[type="range"]')).toContain(
      'min-height: 2.75rem',
    )
    expect(declarations('.listen-player input[type="range"]')).toContain(
      'width: 100%',
    )
    expect(declarations('.listen-current-status')).toContain('position: absolute')
    expect(declarations('.listen-current-status')).toContain('width: 1px')

    const responsiveRules = css.slice(css.indexOf('@media (max-width: 760px)'))
    const phoneRules = css.slice(css.indexOf('@media (max-width: 420px)'))

    expect(phoneRules).toMatch(
      /\.app-header,\s*\.listen-now-playing\s*\{[^}]*flex-direction:\s*column/s,
    )
    expect(phoneRules).toMatch(
      /\.listen-now-playing > div\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%/s,
    )
    expect(responsiveRules).toMatch(
      /\.listen-screen-heading\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
    )
  })

  it('stacks the Practice surface without shrinking its controls below touch size', () => {
    expect(declarations('.player-mode-switch')).toContain('min-height: 2.75rem')
    expect(declarations('.practice-seek-controls')).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr))',
    )
    expect(declarations('.practice-seek-controls button')).toContain(
      'min-height: 2.75rem',
    )
    expect(declarations('.practice-loop-controls button')).toContain(
      'min-height: 2.75rem',
    )

    const phoneRules = css.slice(css.indexOf('@media (max-width: 420px)'))

    expect(phoneRules).toMatch(
      /\.practice-controls\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
    )
    expect(phoneRules).toMatch(
      /\.practice-loop-controls\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s,
    )
  })

  it('keeps the persistent library shrinkable, recoverable, and stacked on phones', () => {
    expect(declarations('.library-workspace')).toContain('min-width: 0')
    expect(declarations('.library-tree')).toContain('overflow-y: auto')
    expect(declarations('.library-tree:focus-visible')).toContain(
      'outline-offset: -3px',
    )
    expect(declarations('.library-track-meta')).toContain('overflow: hidden')
    expect(
      declarations('.library-folder-node[data-indent="capped"]'),
    ).toContain('padding-left: 0')

    const phoneRules = css.slice(css.indexOf('@media (max-width: 420px)'))

    expect(phoneRules).toMatch(
      /\.library-workspace-heading,\s*\.library-root-heading\s*\{[^}]*flex-direction:\s*column/s,
    )
    expect(phoneRules).toMatch(
      /\.library-primary-button,\s*\.library-secondary-button\s*\{[^}]*width:\s*100%/s,
    )
  })
})
