/**
 * Offline smoke test for the Client half.
 *
 * Loads `client.js` with a stubbed module loader and React, runs `apply()` over
 * a recording Client context, and checks that both seats register on the slots
 * this plugin was built for and that every dictionary key the source uses
 * exists in both locales.
 *
 * Usage: node tools/smoke.mjs
 */

import { readFile, writeFile, rm } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import os from 'node:os'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const source = await readFile(path.join(root, 'client.js'), 'utf8')
const MAX_QUOTE_CHARS_EXPECTED = Number(/const MAX_QUOTE_CHARS = (\d+)/u.exec(source)?.[1] ?? 0)

let factory
const head = []
globalThis.document = {
  head: { appendChild: (tag) => head.push(tag), removeChild: (tag) => head.splice(head.indexOf(tag), 1) },
  createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
  addEventListener() {},
  removeEventListener() {},
  querySelector: () => null,
  body: { appendChild() {}, removeChild() {} },
}
globalThis.window = {
  __ModuleLoader__: {
    load(module) {
      factory = module.factory
    },
  },
  addEventListener() {},
  removeEventListener() {},
  getSelection: () => null,
  innerHeight: 0,
  innerWidth: 0,
}

await import(pathToFileURL(path.join(root, 'client.js')).href)

if (typeof factory !== 'function') throw new Error('client.js did not register a factory')

const plugin = factory((name) => {
  if (name === 'react') return { createElement: () => null }
  throw new Error(`unexpected require("${name}")`)
})

const effects = []
const injections = []
const registrations = []
let registered = null
const ctx = {
  effect(body, label) {
    const dispose = body()
    effects.push({ label, dispose })
    return dispose
  },
  locale: {
    register(namespace, dictionaries) {
      registered = { namespace, dictionaries }
      return () => {}
    },
  },
  slots: {
    inject(key, callback) {
      injections.push(key)
      callback()
      return () => {}
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
}

if (typeof plugin.apply !== 'function') throw new Error('plugin has no apply()')
plugin.apply(ctx)

const problems = []
const slotOf = (id) => registrations.find((entry) => entry.options.id === id)

const dock = slotOf('quote-reply')
const float = slotOf('quote-reply.float')
if (dock === undefined) problems.push('conversation.input.dock seat "quote-reply" was not registered')
if (float === undefined) problems.push('shell.overlay seat "quote-reply.float" was not registered')
if (dock !== undefined && dock.options.name !== 'conversation.input.dock') problems.push('dock seat landed on the wrong slot')
if (float !== undefined && float.options.name !== 'shell.overlay') problems.push('float seat landed on the wrong slot')
for (const entry of [dock, float]) {
  if (entry !== undefined && typeof entry.component !== 'function') problems.push(`seat ${entry.options.id} has no component`)
}
if (injections.length !== registrations.length) problems.push('slot injection count does not match registrations')

if (registered === null) problems.push('locale dictionaries were not registered')
else {
  const used = new Set([...source.matchAll(/\bt\('([a-zA-Z0-9._-]+)'/gu)].map((match) => match[1]))
  for (const locale of ['zh', 'en']) {
    const dictionary = registered.dictionaries[locale]
    if (dictionary === undefined) {
      problems.push(`locale "${locale}" is missing`)
      continue
    }
    for (const key of used) if (dictionary[key] === undefined) problems.push(`locale "${locale}" misses key "${key}"`)
  }
  console.log(`dictionaries: ${registered.namespace} [${Object.keys(registered.dictionaries).join(', ')}], ${used.size} key(s) used`)
}

for (const name of ['inject', 'apply']) {
  if (!(name in plugin)) problems.push(`plugin export "${name}" is missing`)
}
console.log(`effects: ${effects.map((entry) => entry.label).join(' | ')}`)
console.log(`seats: ${registrations.map((entry) => `${entry.options.name}#${entry.options.id}`).join(' | ')}`)

for (const effect of effects) if (typeof effect.dispose === 'function') effect.dispose()

/* ------------------------------------------------------------------ *
 * Quote-shaping behavior, exercised through the same source text
 * ------------------------------------------------------------------ */

const MARKER = "    return {\n      inject: ['slots', 'locale', 'sessions'],"
if (!source.includes(MARKER)) problems.push('client.js no longer matches the shape this harness instruments')
else {
  const instrumented = source.replace(
    MARKER,
    '    globalThis.__quoteReplyTest = { shapeQuote, toBlockquote, stagedQuote, composedText, stripChips, parseChipText, chipSpan };\n' +
      MARKER,
  )
  const copy = path.join(os.tmpdir(), `quote-reply-smoke-${process.pid}.mjs`)
  await writeFile(copy, instrumented, 'utf8')
  try {
    await import(`${pathToFileURL(copy).href}?v=${Date.now()}`)
    // The instrumented copy re-registers its factory; calling it publishes the helpers.
    factory((name) => {
      if (name === 'react') return { createElement: () => null }
      throw new Error(`unexpected require("${name}")`)
    })
  } finally {
    await rm(copy, { force: true })
  }

  const { shapeQuote, toBlockquote, stagedQuote, composedText, stripChips, parseChipText, chipSpan } =
    globalThis.__quoteReplyTest
  const check = (label, actual, expected) => {
    const left = JSON.stringify(actual)
    const right = JSON.stringify(expected)
    if (left !== right) problems.push(`${label}: ${left} !== ${right}`)
  }

  check('shapeQuote trims blank edges', shapeQuote('\n\n  hello  \nworld\n\n'), '  hello\nworld')
  check('shapeQuote keeps inner blank lines', shapeQuote('a\n\nb'), 'a\n\nb')
  check('shapeQuote caps lines', shapeQuote(Array.from({ length: 90 }, (_, i) => `l${i}`).join('\n')).split('\n').length, 81)
  check(
    'shapeQuote caps characters',
    shapeQuote('x'.repeat(5000)).length,
    MAX_QUOTE_CHARS_EXPECTED + 2,
  )
  check('shapeQuote survives astral characters', shapeQuote('🙂'.repeat(10)).length, 20)
  check('toBlockquote marks every line', toBlockquote('a\n\nb'), '> a\n>\n> b')
  check('stagedQuote reads a leading block', stagedQuote('> a\n> b\n\nreply'), { lines: 2, rest: 'reply' })
  check('stagedQuote reads a trailing block', stagedQuote('reply\n\n> a\n> b'), { lines: 2, rest: 'reply' })
  check('stagedQuote reads a quote-only draft', stagedQuote('> a\n'), { lines: 1, rest: '' })
  check('stagedQuote ignores a plain draft', stagedQuote('hello'), null)
  check('stagedQuote survives an inner gap', stagedQuote('lead\n\n> a\n\n> b\ntail'), {
    lines: 1,
    rest: 'lead\n\n> b\ntail',
  })
  check('composedText quotes without a comment', composedText({ text: 'a\nb', comment: '  ' }), '> a\n> b')
  check('composedText quotes with a comment', composedText({ text: 'a', comment: ' 好的 ' }), '> a\n\n好的')
  check('stripChips removes one chip text', stripChips('> a\n\n好的 ', [{ clipboardText: '> a\n\n好的' }]), '')
  check(
    'stripChips keeps the surrounding draft',
    stripChips('先写的\n\n> a\n\n好的\n\n后写的', [{ clipboardText: '> a\n\n好的' }]),
    '先写的\n\n后写的',
  )
  check('stripChips reports a missing chip', stripChips('别的草稿', [{ clipboardText: '> a' }]), null)
  check('parseChipText splits quote and comment', parseChipText('> a\n> b\n\n评论'), { quote: 'a\nb', comment: '评论' })
  check('parseChipText reads a comment-less chip', parseChipText('> a\n\n'), { quote: 'a', comment: '' })
  check('parseChipText keeps an empty quoted line', parseChipText('>\n> b\n\nx'), { quote: '\nb', comment: 'x' })
  const caret = { start: 0, end: 0, draftRev: 3 }
  check('chipSpan finds the first chip', chipSpan({ ref: 'a', offset: 0, length: 10 }, [{ ref: 'a', offset: 0, length: 10 }], caret), {
    start: 0,
    end: 1,
    draftRev: 3,
  })
  check(
    'chipSpan shifts past earlier chips',
    chipSpan({ ref: 'a', offset: 7, length: 9 }, [{ ref: 'x', offset: 0, length: 5 }, { ref: 'a', offset: 7, length: 9 }], caret),
    { start: 3, end: 4, draftRev: 3 },
  )
  check('chipSpan reports a deleted chip', chipSpan({ ref: 'a' }, [{ ref: 'b', offset: 0, length: 5 }], caret), null)
  check('chipSpan needs a revision', chipSpan({ ref: 'a', offset: 0, length: 5 }, [{ ref: 'a', offset: 0, length: 5 }], null), null)
}

if (problems.length > 0) {
  console.error('\nFAILED:')
  for (const problem of problems) console.error(` - ${problem}`)
  process.exit(1)
}
console.log('\nOK')
