/**
 * Offline check of the Host half's projection contract.
 *
 * It replays this session's real event log through the unit registered by
 * `apply()`, the way the projection registry drives it, and asserts the fold
 * contract: identical state reference for unrelated events, one graph for the
 * logged `mindmap` call, and a stable wire view reference.
 *
 * Usage:
 *   node tools/test-projection.mjs <path-to-session.v4.jsonl.zstd>
 */

import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { apply } from '../index.js'

const path = process.argv[2]
if (path === undefined) {
  console.error('usage: node tools/test-projection.mjs <session.v4.jsonl.zstd>')
  process.exit(2)
}

/** Decode the append-per-line zstd store; Node's decoder stops at the first frame. */
function decodeLog(file) {
  const buf = readFileSync(file)
  const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
  const offsets = []
  for (let i = 0; i + 4 <= buf.length; i += 1) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) {
      offsets.push(i)
    }
  }
  const parts = []
  for (let index = 0; index < offsets.length; index += 1) {
    const start = offsets[index]
    const end = index + 1 < offsets.length ? offsets[index + 1] : buf.length
    try {
      parts.push(zstdDecompressSync(buf.subarray(start, end)).toString('utf8'))
    } catch {
      /* false magic inside compressed bytes */
    }
  }
  return parts
    .join('')
    .split('\n')
    .filter((line) => line !== '')
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
}

const captured = {}
const ctx = {
  effect: (callback, label) => {
    const disposer = callback()
    captured[label] = disposer
    return disposer
  },
  sessionProjections: {
    register: (definition) => {
      captured.unit = definition
      return () => {}
    },
  },
  tools: {
    register: (definition) => {
      captured.tool = definition
      return () => {}
    },
  },
  systemPrompt: {
    section: (section) => {
      captured.section = section
      return () => {}
    },
  },
}

apply(ctx, { prompt: true, maxNodes: 40 })
console.log('registered unit:', captured.unit?.key, 'stateVersion', captured.unit?.stateVersion)
console.log('registered tool:', captured.tool?.name)
console.log('registered section:', captured.section?.name, 'order', captured.section?.order)
if (captured.unit === undefined) throw new Error('no projection unit registered')

const events = decodeLog(path)
console.log('events replayed:', events.length)

let state = captured.unit.init({ version: 4, id: 'test', createdAt: 0, isSeeded: false }, 0)
let unchanged = 0
let changed = 0
for (const event of events) {
  const next = captured.unit.apply(state, event)
  if (next === state) unchanged += 1
  else {
    changed += 1
    console.log('state changed at seq', event.seq, 'by', event.type)
  }
  state = next
}

console.log('unchanged:', unchanged, 'changed:', changed)
const view = captured.unit.wire.view(state)
console.log('view is graph reference:', view === state.graph)
if (state.graph === null) {
  console.error('FAIL: the logged mindmap call did not fold into a graph')
  process.exit(1)
}
console.log('title:', state.graph.title)
console.log('nodes:', state.graph.nodes.length, 'links:', state.graph.links.length)
console.log('roots:', state.graph.nodes.filter((node) => node.parent === null).map((node) => node.id).join(','))
console.log('view parse identity:', captured.unit.wire.viewSchema.parse(view) === view)
console.log('OK')
