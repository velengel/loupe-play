import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('local learning artifact boundary', () => {
  it('keeps personal quizzes outside repository history', () => {
    const ignoreRules = readFileSync(
      resolve(process.cwd(), '.gitignore'),
      'utf8',
    ).split(/\r?\n/)

    expect(ignoreRules).toContain('.mydocs/')
  })
})
