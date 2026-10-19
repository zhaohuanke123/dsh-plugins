/**
 * Render-level smoke test for the Client half.
 *
 * The browser's React is not available in Node, so this file ships a miniature
 * hook runtime: components are called for real, effects run, rAF callbacks are
 * flushed on demand, and the fake document/window let a test drive a selection
 * the way the page would. That catches the class of defect the pure-function
 * tests cannot see (a render-time ReferenceError, which blanks a slot entry).
 *
 * Usage: node tools/render-smoke.mjs
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const source = await readFile(path.join(root, 'client.js'), 'utf8')

/* ------------------------------------------------------------------ *
 * Fake browser
 * ------------------------------------------------------------------ */

class FakeElement {
  constructor(tag = 'div', attrs = {}) {
    this.nodeType = 1
    this.tagName = tag.toUpperCase()
    this.attributes = attrs
    this.parentElement = null
    this.offsetWidth = 0
  }

  closest(selector) {
    return (this.attributes.selectors ?? []).includes(selector) ? this : null
  }
}

globalThis.Element = FakeElement
globalThis.HTMLElement = FakeElement
globalThis.Node = FakeElement

const listeners = new Map()
const frames = new Map()
let frameSeq = 0

const rect = { left: 120, right: 260, top: 300, bottom: 318, width: 140, height: 18 }

let selection = null

globalThis.document = {
  head: { appendChild() {}, removeChild() {} },
  createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
  body: { appendChild() {}, removeChild() {} },
  querySelector: () => null,
  addEventListener(type, listener) {
    const list = listeners.get(type) ?? []
    list.push(listener)
    listeners.set(type, list)
  },
  removeEventListener(type, listener) {
    const list = listeners.get(type) ?? []
    listeners.set(
      type,
      list.filter((entry) => entry !== listener),
    )
  },
}

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 800,
  __ModuleLoader__: {
    load(module) {
      globalThis.__factory = module.factory
    },
  },
  getSelection: () => selection,
  addEventListener(type, listener) {
    globalThis.document.addEventListener(type, listener)
  },
  removeEventListener(type, listener) {
    globalThis.document.removeEventListener(type, listener)
  },
}

globalThis.requestAnimationFrame = (callback) => {
  frameSeq += 1
  frames.set(frameSeq, callback)
  return frameSeq
}
globalThis.cancelAnimationFrame = (id) => frames.delete(id)

/** Run every scheduled animation frame. */
function flushFrames() {
  const pending = [...frames.entries()]
  frames.clear()
  for (const [, callback] of pending) callback()
}

/** Fire one document event at every listener of that type. */
function fire(type, event = {}) {
  for (const listener of [...(listeners.get(type) ?? [])]) listener(event)
}

/* ------------------------------------------------------------------ *
 * Miniature hook runtime
 * ------------------------------------------------------------------ */

const instances = new Map()
let hooks = []
let cursor = 0
let interrupted = false

function takeHook() {
  const hook = hooks[cursor] ?? {}
  hooks[cursor] = hook
  cursor += 1
  return hook
}

const React = {
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false)
    return { type, props: props ?? {}, children: flat }
  },
  useRef(initial) {
    const hook = takeHook()
    if (!('current' in hook)) hook.current = initial
    return hook
  },
  useState(initial) {
    const hook = takeHook()
    if (!('value' in hook)) hook.value = typeof initial === 'function' ? initial() : initial
    return [
      hook.value,
      (next) => {
        const value = typeof next === 'function' ? next(hook.value) : next
        // React bails out of a re-render when the value is unchanged.
        if (Object.is(value, hook.value)) return
        hook.value = value
        interrupted = true
      },
    ]
  },
  useEffect(effect, deps) {
    const hook = takeHook()
    hook.effect = effect
    hook.deps = deps
  },
  useLayoutEffect(effect, deps) {
    const hook = takeHook()
    hook.layout = effect
    hook.deps = deps
  },
}

/**
 * Whether one effect must run again for this render pass.
 * @param hook - the hook slot.
 * @returns true when the deps changed (or are absent).
 */
function effectChanged(hook) {
  if (hook.deps === undefined) return true
  const previous = hook.lastDeps
  if (previous === undefined || previous.length !== hook.deps.length) return true
  return hook.deps.some((value, index) => !Object.is(value, previous[index]))
}

/**
 * Render one component with persisted hooks, running effects to convergence.
 * @param component - the component function.
 * @param props - its props.
 * @returns the rendered element tree.
 */
function render(component, props) {
  let entry = instances.get(component)
  if (entry === undefined) {
    entry = { hooks: [], cleanups: [] }
    instances.set(component, entry)
  }
  let tree
  for (let pass = 0; pass < 10; pass += 1) {
    hooks = entry.hooks
    cursor = 0
    interrupted = false
    tree = component(props)
    const registered = entry.hooks.slice(0, cursor)
    for (const hook of registered) {
      if (typeof hook.layout === 'function' && effectChanged(hook)) {
        if (hook.cleanup !== undefined) {
          hook.cleanup()
          hook.cleanup = undefined
        }
        const cleanup = hook.layout()
        if (typeof cleanup === 'function') hook.cleanup = cleanup
        hook.lastDeps = hook.deps
      }
      hook.layout = undefined
    }
    for (const hook of registered) {
      if (typeof hook.effect === 'function' && effectChanged(hook)) {
        if (hook.cleanup !== undefined) {
          hook.cleanup()
          hook.cleanup = undefined
        }
        const cleanup = hook.effect()
        if (typeof cleanup === 'function') hook.cleanup = cleanup
        hook.lastDeps = hook.deps
      }
      hook.effect = undefined
    }
    if (!interrupted) return tree
  }
  throw new Error(`${component.name} never settled`)
}

/** Find the first element in a tree whose className matches. */
function find(tree, className) {
  if (tree === null || tree === undefined || typeof tree !== 'object') return null
  if (typeof tree.props?.className === 'string' && tree.props.className.split(' ').includes(className)) return tree
  for (const child of tree.children ?? []) {
    const hit = find(child, className)
    if (hit !== null) return hit
  }
  return null
}

/** Every element in a tree whose className matches. */
function findAll(tree, className, out = []) {
  if (tree === null || tree === undefined || typeof tree !== 'object') return out
  if (typeof tree.props?.className === 'string' && tree.props.className.split(' ').includes(className)) out.push(tree)
  for (const child of tree.children ?? []) findAll(child, className, out)
  return out
}

/** Text of a rendered element, as a plain string. */
function textOf(tree) {
  if (tree === null || tree === undefined || tree === false) return ''
  if (typeof tree === 'string') return tree
  if (typeof tree === 'number') return String(tree)
  return (tree.children ?? []).map(textOf).join('')
}

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

await import(pathToFileURL(path.join(root, 'client.js')).href)

const plugin = globalThis.__factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require("${name}")`)
})

const problems = []
const check = (label, actual, expected) => {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left !== right) problems.push(`${label}: ${left} !== ${right}`)
}
const expect = (label, condition) => {
  if (!condition) problems.push(label)
}

const registrations = []
const ctx = {
  effect(body) {
    body()
    return () => {}
  },
  locale: {
    register: () => () => {},
  },
  sessions: {
    scope: () => undefined,
  },
  slots: {
    inject(key, callback) {
      callback()
      return () => {}
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
}
plugin.apply(ctx)

const seat = registrations.find((entry) => entry.options.id === 'quote-reply')?.component
const overlay = registrations.find((entry) => entry.options.id === 'quote-reply.float')?.component
if (seat === undefined || overlay === undefined) throw new Error('seats did not register')

const t = (key, params) => (params === undefined ? key : `${key}:${Object.values(params).join(',')}`)

const calls = { insertReference: [], setDraft: [], insertText: [], submit: 0, focus: 0 }
const inputState = { draft: '', phase: 'plain', occurrences: [] }
const actions = {
  captureInsertion: () => ({ start: 0, end: 0, draftRev: 7 }),
  insertText: (text, span) => {
    calls.insertText.push({ text, span })
    inputState.draft = text
    return true
  },
  setDraft: (text) => {
    calls.setDraft.push(text)
    inputState.draft = text
  },
  submit: () => {
    calls.submit += 1
  },
}

const seatProps = {
  t,
  inputActions: actions,
  useInput: undefined,
  input: inputState,
  focusComposer: () => {
    calls.focus += 1
  },
  insertReference: (reference, span) => {
    calls.insertReference.push({ reference, span })
    return true
  },
}

// 1. Nothing staged: the seat stays invisible, and it publishes the bridge.
check('idle seat renders nothing', render(seat, seatProps), null)

// 2. No selection: the overlay stays invisible.
selection = null
check('idle overlay renders nothing', render(overlay, { t }), null)

// 3. A transcript selection grows the pill.
const chatElement = new FakeElement('div', { selectors: ['[data-chat-flow]'] })
selection = {
  isCollapsed: false,
  rangeCount: 1,
  toString: () => 'quoted line 1\nline 2',
  getRangeAt: () => ({
    commonAncestorContainer: chatElement,
    getClientRects: () => [rect],
    getBoundingClientRect: () => rect,
  }),
}
fire('selectionchange')
flushFrames()
let tree = render(overlay, { t })
const pill = find(tree, 'dqr-float')
expect('selection shows the pill', pill !== null)
check('pill carries the label', textOf(pill), 'float.label')

// 4. Opening the pill opens the card.
pill.props.onMouseDown({ preventDefault() {}, stopPropagation() {} })
tree = render(overlay, { t })
expect('pill click opens the card', find(tree, 'dqr-card') !== null)
expect('card shows the quote', textOf(find(tree, 'dqr-quote')) === 'quoted line 1\nline 2')

// 5. Typing a comment and attaching folds one chip into the composer.
const input = find(tree, 'dqr-input')
input.props.onChange({ target: { value: '我的评论' } })
tree = render(overlay, { t })
const attachButton = findAll(tree, 'dqr-btn').find((button) => textOf(button) === 'card.attach')
expect('card offers attach', attachButton !== undefined)
attachButton.props.onClick()
tree = render(overlay, { t })
check('attach inserts one chip', calls.insertReference.length, 1)
check('chip carries the composed text', calls.insertReference[0].reference.clipboardText, '> quoted line 1\n> line 2\n\n我的评论\n\n')
check('chip keeps the plugin source', calls.insertReference[0].reference.source, '@local/dsh-quote-reply')
check('chip uses the caret span', calls.insertReference[0].span, { start: 0, end: 0, draftRev: 7 })
check('attach focuses the composer', calls.focus, 1)
expect('card closes after attach', find(tree, 'dqr-card') === null)

// 6. Two attached quotes: a tray row each, every row editable and removable.
const chipOne = '> quoted line 1\n> line 2\n\n我的评论\n\n'
const occurrenceOne = { source: '@local/dsh-quote-reply', ref: 'q1', offset: 0, length: chipOne.length, clipboardText: chipOne }
inputState.draft = `${chipOne} `
inputState.occurrences = [occurrenceOne]
tree = render(seat, seatProps)
check('row reports its own quote lines', textOf(find(tree, 'dqr-chipLabel')), 'chip.quote:2')
check('row previews the comment', textOf(find(tree, 'dqr-rowComment')), '我的评论')
check('a single row offers edit and remove', findAll(tree, 'dqr-textBtn').length, 2)

const chipTwo = '> second quote\n\n第二条评论\n\n'
const occurrenceTwo = {
  source: '@local/dsh-quote-reply',
  ref: 'q2',
  offset: chipOne.length + 1,
  length: chipTwo.length,
  clipboardText: chipTwo,
}
inputState.draft = `${chipOne} ${chipTwo} `
inputState.occurrences = [occurrenceOne, occurrenceTwo]
tree = render(seat, seatProps)
const rows = findAll(tree, 'dqr-row')
check('two quotes produce two rows', rows.length, 2)
check('the second row reports its own quote', textOf(find(rows[1], 'dqr-chipLabel')), 'chip.quote:1')
check('the second row previews its own comment', textOf(find(rows[1], 'dqr-rowComment')), '第二条评论')
check('every row keeps both actions', rows.map((row) => findAll(row, 'dqr-textBtn').length), [2, 2])

// 7. Editing the second quote prefills that quote, not the first.
findAll(rows[1], 'dqr-textBtn')[0].props.onClick({ currentTarget: { getBoundingClientRect: () => rect } })
tree = render(overlay, { t })
expect('the edit button opens the card', find(tree, 'dqr-card') !== null)
check('edit card is titled for editing', textOf(find(tree, 'dqr-cardTitle')).includes('card.editTitle'), true)
check('edit card shows the second quote', textOf(find(tree, 'dqr-quote')), 'second quote')
check('edit card prefills the second comment', find(tree, 'dqr-input').props.value, '第二条评论')

// 8. Saving rewrites that chip in place, at its own one-character detect span.
find(tree, 'dqr-input').props.onChange({ target: { value: '改过的评论' } })
tree = render(overlay, { t })
findAll(tree, 'dqr-btn')
  .find((button) => textOf(button) === 'card.save')
  .props.onClick()
tree = render(overlay, { t })
check('save writes the edited chip', calls.insertReference.length, 2)
check('the rewrite carries the new comment', calls.insertReference[1].reference.clipboardText, '> second quote\n\n改过的评论\n\n')
check(
  'the rewrite targets the second chip, not the first',
  calls.insertReference[1].span,
  // chip two starts after chip one's clipboard text plus the separator space,
  // and chip one occupies a single detect character.
  { start: chipOne.length + 1 - (chipOne.length - 1), end: chipOne.length + 2 - (chipOne.length - 1), draftRev: 7 },
)
expect('card closes after save', find(tree, 'dqr-card') === null)

// 9. Removing one quote leaves the other one (and the user's text) alone.
tree = render(seat, seatProps)
const firstRemove = findAll(findAll(tree, 'dqr-row')[0], 'dqr-textBtn')[1]
const removals = calls.insertText.length
firstRemove.props.onClick()
check('remove writes one empty positional edit', calls.insertText.length, removals + 1)
check('remove targets the first chip', calls.insertText[removals].span, { start: 0, end: 1, draftRev: 7 })
check('remove never rebuilds the draft', calls.setDraft.length, 0)

// 10. A third quote can still be sent directly while other chips sit in the draft.
inputState.draft = `${chipTwo} `
inputState.occurrences = [occurrenceTwo]
selection = {
  isCollapsed: false,
  rangeCount: 1,
  toString: () => 'third passage',
  getRangeAt: () => ({
    commonAncestorContainer: chatElement,
    getClientRects: () => [rect],
    getBoundingClientRect: () => rect,
  }),
}
fire('selectionchange')
flushFrames()
tree = render(overlay, { t })
find(tree, 'dqr-float').props.onMouseDown({ preventDefault() {}, stopPropagation() {} })
tree = render(overlay, { t })
const sendButton = findAll(tree, 'dqr-btn').find((button) => textOf(button) === 'card.send')
expect('send stays available beside existing chips', sendButton !== undefined && sendButton.props.disabled !== true)
const submits = calls.submit
sendButton.props.onClick()
tree = render(overlay, { t })
check('send appends its chip', calls.insertReference.length, 3)
check('send hands the message over', calls.submit, submits + 1)
check('send writes the new quote', calls.insertReference[2].reference.clipboardText, '> third passage')
// The chip label must count exactly the lines the tray shows (shaping included).
check('send labels the shaped line count', calls.insertReference[2].reference.label, 'chip.quote:1')

// 11. The user clears the composer while the edit card is open: saving must refuse.
inputState.occurrences = [occurrenceTwo]
tree = render(seat, seatProps)
findAll(findAll(tree, 'dqr-row')[0], 'dqr-textBtn')[0].props.onClick({ currentTarget: { getBoundingClientRect: () => rect } })
tree = render(overlay, { t })
expect('edit card reopens', find(tree, 'dqr-card') !== null)
const before = calls.insertReference.length
inputState.draft = ''
inputState.occurrences = []
render(seat, seatProps)
findAll(tree, 'dqr-btn')
  .find((button) => textOf(button) === 'card.save')
  .props.onClick()
tree = render(overlay, { t })
check('a vanished chip writes nothing', calls.insertReference.length, before)
check('a vanished chip explains itself', textOf(find(tree, 'dqr-hint')), 'card.stale')

// 12. Collapsing the selection retires the pill.
selection = { isCollapsed: true, rangeCount: 0, toString: () => '', getRangeAt: () => null }
fire('selectionchange')
flushFrames()
expect('a collapsed selection hides the pill', find(render(overlay, { t }), 'dqr-float') === null)

// 13. A hand-typed quote block (no chip) still gets a row, without editing.
inputState.draft = '> hand typed\n> quote\n\n我的问题'
inputState.occurrences = []
tree = render(seat, seatProps)
expect('raw quote rows report themselves', textOf(find(tree, 'dqr-chipLabel')) === 'chip.staged:2')
check('raw quote rows offer removal only', findAll(tree, 'dqr-textBtn').length, 1)

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

if (problems.length > 0) {
  console.error('\nFAILED:')
  for (const problem of problems) console.error(` - ${problem}`)
  process.exit(1)
}
console.log(
  `render smoke: pill, card, attach, two-quote tray, per-chip edit, per-chip remove, send beside chips, stale guard — ${calls.insertReference.length} chip writes, ${calls.insertText.length} positional writes`,
)
console.log('OK')
