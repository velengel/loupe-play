import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('favicon contract', () => {
  it('reuses the canonical LoupePlay application icon', () => {
    const html = readRepositoryFile('index.html')
    const page = new DOMParser().parseFromString(html, 'text/html')
    const icon = page.querySelector('link[rel~="icon"]')

    expect(icon?.getAttribute('href')).toBe(
      '/src-tauri/icons/app-icon.svg',
    )
    expect(icon?.getAttribute('type')).toBe('image/svg+xml')
    expect(icon?.getAttribute('sizes')).toBe('any')
    expect(readRepositoryFile('src-tauri/icons/app-icon.svg')).toContain(
      '<title id="title">LoupePlay</title>',
    )
  })
})
