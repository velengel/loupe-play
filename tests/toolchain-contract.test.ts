import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('toolchain contract', () => {
  it('publishes the Rust minimum required by the pinned metadata parser', () => {
    const cargoManifest = readRepositoryFile('src-tauri/Cargo.toml')
    const readme = readRepositoryFile('README.md')

    expect(cargoManifest).toMatch(/^rust-version = "1\.89"$/m)
    expect(readme).toContain('Rust stable 1.89 以上')
  })

  it('keeps repository-local linked worktrees outside the tracked tree', () => {
    const gitignore = readRepositoryFile('.gitignore')

    expect(gitignore).toMatch(/^\.worktrees\/$/m)
  })
})
