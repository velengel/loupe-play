import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { JSDOM } from 'jsdom'

const repositoryRoot = resolve(import.meta.dirname, '..')
const quizPath = resolve(
  repositoryRoot,
  process.argv[2] ?? '.mydocs/loupe-play-domain-decisions-quiz.html',
)

function check(condition, message) {
  if (!condition) throw new Error(message)
}

check(existsSync(quizPath), `quiz is missing: ${quizPath}`)
const html = readFileSync(quizPath, 'utf8')
const dom = new JSDOM(html)
const { document } = dom.window
const dataElement = document.querySelector('#quiz-data[type="application/json"]')
check(dataElement, 'quiz data JSON is missing')
const questions = JSON.parse(dataElement.textContent)

check(questions.length === 7, `expected 7 questions, got ${questions.length}`)
const choiceQuestions = questions.filter(
  (question) => question.type === 'choice',
)
const blankQuestions = questions.filter((question) => question.type === 'blank')
check(choiceQuestions.length === 4, 'expected exactly 4 choice questions')
check(blankQuestions.length === 3, 'expected exactly 3 fill-in questions')
check(
  JSON.stringify(choiceQuestions.map((question) => question.correctIndex)) ===
    JSON.stringify([1, 3, 0, 2]),
  'choice answer positions must vary as B, D, A, C',
)

const prompts = questions.map((question) => question.prompt)
check(new Set(prompts).size === prompts.length, 'question prompts are duplicated')

for (const question of questions) {
  check(question.prompt.trim().length > 0, `${question.id}: prompt is empty`)
  check(
    question.correctAnswer.trim().length > 0,
    `${question.id}: correct answer is empty`,
  )
  check(
    question.explanation.trim().length > 0,
    `${question.id}: explanation is empty`,
  )
  check(question.references.length > 0, `${question.id}: references are empty`)

  for (const reference of question.references) {
    check(
      reference.reason.trim().length > 0,
      `${question.id}: reference reason is empty`,
    )
    check(
      /#L\d+-L\d+$/.test(reference.href),
      `${question.id}: reference lacks a full line range`,
    )
    const [relativePath, fragment] = reference.href.split('#')
    check(
      reference.label.endsWith(`:${fragment}`),
      `${question.id}: label and href line ranges differ`,
    )
    const targetPath = resolve(dirname(quizPath), relativePath)
    check(
      existsSync(targetPath),
      `${question.id}: reference target is missing: ${relativePath}`,
    )
    const match = fragment.match(/^L(\d+)-L(\d+)$/)
    const lineCount = readFileSync(targetPath, 'utf8').split(/\r?\n/).length
    check(
      Number(match[1]) <= Number(match[2]),
      `${question.id}: reversed line range`,
    )
    check(
      Number(match[2]) <= lineCount,
      `${question.id}: line range exceeds target`,
    )
  }

  if (question.type === 'choice') {
    check(question.choices.length === 4, `${question.id}: expected four choices`)
    check(
      Number.isInteger(question.correctIndex) &&
        question.correctIndex >= 0 &&
        question.correctIndex < question.choices.length,
      `${question.id}: invalid deterministic correctIndex`,
    )
    check(
      question.choices.every((choice) => choice.feedback.trim().length > 0),
      `${question.id}: choice-specific feedback is missing`,
    )
  } else {
    check(
      question.accepted.length > 0,
      `${question.id}: accepted answers are empty`,
    )
    check(question.hint.trim().length > 0, `${question.id}: hint is empty`)
  }
}

check(
  document.querySelectorAll('[data-question-card]').length === 1,
  'initial view must show one question',
)
check(
  document.querySelectorAll('[data-prompt]').length === 1,
  'initial prompt must appear once',
)
check(
  document.querySelector('[data-prompt]')?.textContent.trim() ===
    questions[0].prompt,
  'initial prompt must match question 1',
)
check(
  document.querySelectorAll('.button-primary').length === 1,
  'initial view must have one primary action',
)
check(
  document.querySelector('.button-primary')?.textContent.trim() === '回答する',
  'initial primary action must submit',
)

const favicon = document.querySelector('link[rel~="icon"]')
check(
  favicon?.getAttribute('href') === '../src-tauri/icons/app-icon.svg',
  'quiz favicon must reuse app icon',
)
check(
  existsSync(resolve(dirname(quizPath), favicon.getAttribute('href'))),
  'quiz favicon target is missing',
)
check(
  !document.querySelector('[src^="http"], [href^="http"]'),
  'quiz must not depend on remote assets',
)
check(html.includes('target="_blank"'), 'references must open in a new tab')
check(
  html.includes('rel="noopener noreferrer"'),
  'references must isolate the opener',
)
check(html.includes('compositionstart'), 'IME compositionstart guard is missing')
check(html.includes('event.isComposing'), 'IME isComposing guard is missing')
check(
  html.includes('event.keyCode === 229'),
  'IME keyCode 229 guard is missing',
)
check(
  html.includes('@media (prefers-reduced-motion: reduce)'),
  'reduced-motion fallback is missing',
)
check(
  html.includes('width: calc(100% - 32px);') &&
    html.includes('max-width: 920px;') &&
    html.includes('width: calc(100% - 20px);'),
  'responsive page width must use calc with an explicit max-width',
)
check(html.includes('[hidden]'), 'explicit hidden contract is missing')
check(document.querySelector('[aria-live]'), 'result live region is missing')

const siblingFiles = readdirSync(dirname(quizPath)).filter(
  (fileName) => fileName.endsWith('.html'),
)
check(
  siblingFiles.length === 1 &&
    siblingFiles[0] === 'loupe-play-domain-decisions-quiz.html',
  `unexpected files beside quiz: ${siblingFiles.join(', ')}`,
)

dom.window.close()
console.log('PASS: quiz static structure, data, sources, and interaction contracts')
