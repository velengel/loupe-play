import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

function readJson(relativePath: string) {
  return JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
  ) as Record<string, unknown>
}

describe('Tauri security boundary', () => {
  it('keeps local audio fixtures out of version control', () => {
    const fixturePaths = [
      'fixtures/example.wav',
      'fixtures/EXAMPLE.WAV',
      'fixtures/example.Mp3',
      'fixtures/EXAMPLE.FLAC',
    ]
    const ignoredPaths = execFileSync(
      'git',
      [
        '-c',
        'core.ignoreCase=false',
        'check-ignore',
        '--no-index',
        '--stdin',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        input: `${fixturePaths.join('\n')}\n`,
      },
    )
      .trim()
      .split('\n')

    expect(ignoredPaths).toEqual(fixturePaths)
  })

  it('preloads only the LoupePlay database', () => {
    const config = readJson('../src-tauri/tauri.conf.json') as {
      plugins?: { sql?: { preload?: string[] } }
    }

    expect(config.plugins?.sql?.preload).toEqual(['sqlite:loupe-play.db'])
  })

  it('grants only the commands used by the foundation window', () => {
    const capability = readJson(
      '../src-tauri/capabilities/default.json',
    ) as { permissions?: string[] }

    expect(capability.permissions).toEqual([
      'core:path:allow-join',
      'dialog:allow-open',
      'fs:allow-read-dir',
      'sql:allow-execute',
      'sql:allow-select',
    ])
  })

  it('keeps the asset protocol statically closed', () => {
    const config = readJson('../src-tauri/tauri.conf.json') as {
      app?: {
        security?: {
          assetProtocol?: { enable?: boolean; scope?: string[] }
        }
      }
    }

    expect(config.app?.security?.assetProtocol).toEqual({
      enable: true,
      scope: [],
    })
  })

  it('does not allow inline production styles or scripts', () => {
    const config = readJson('../src-tauri/tauri.conf.json') as {
      app?: { security?: { csp?: string } }
    }
    const csp = config.app?.security?.csp

    expect(csp).toBeTypeOf('string')
    expect(csp).not.toContain("'unsafe-inline'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain(
      "media-src 'self' asset: http://asset.localhost",
    )
  })
})
