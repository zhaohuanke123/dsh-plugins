/**
 * Decode a DSH session log for inspection.
 *
 * The persistence store appends one zstd frame per line, and Node's zstd
 * decompressor stops at the first frame, so this scans frame magic offsets and
 * decompresses each slice before falling back to whole-file decoding.
 *
 * Usage:
 *   node tools/decode-session-log.mjs <session.v4.jsonl.zstd> [substring]
 */

import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const path = process.argv[2]
const needle = process.argv[3]
if (path === undefined) {
  console.error('usage: node tools/decode-session-log.mjs <session.v4.jsonl.zstd> [substring]')
  process.exit(2)
}

const buf = readFileSync(path)
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
    /* a false magic inside compressed bytes: skip that slice */
  }
}

const lines = parts.join('').split('\n').filter((line) => line !== '')
const types = new Map()
const toolNames = new Map()
const matched = []

for (const line of lines) {
  let event
  try {
    event = JSON.parse(line)
  } catch {
    continue
  }
  types.set(event.type, (types.get(event.type) ?? 0) + 1)
  if (event.type === 'tool/call') {
    const name = event.data?.name ?? 'unknown'
    toolNames.set(name, (toolNames.get(name) ?? 0) + 1)
  }
  if (needle !== undefined && line.includes(needle)) matched.push({ seq: event.seq, type: event.type, line })
}

console.log(`frames=${offsets.length} lines=${lines.length}`)
console.log('event types:', Object.fromEntries([...types.entries()].sort()))
console.log('tools:', Object.fromEntries([...toolNames.entries()].sort()))
if (needle !== undefined) {
  console.log(`matches for ${JSON.stringify(needle)}:`, matched.length)
  for (const item of matched.slice(-10)) {
    console.log('---', item.type, 'seq', item.seq, '---')
    console.log(item.line.slice(0, 900))
  }
}
