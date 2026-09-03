import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

describe('library privacy boundary', () => {
  it('keeps local SQLite files with personal paths and tags out of Git', () => {
    const databasePaths = [
      'loupe-play.db',
      'loupe-play.db-wal',
      'loupe-play.db-shm',
    ]
    const result = spawnSync(
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
        input: `${databasePaths.join('\n')}\n`,
      },
    )

    expect(result.stdout.trim().split('\n').filter(Boolean)).toEqual(
      databasePaths,
    )
  })
})
