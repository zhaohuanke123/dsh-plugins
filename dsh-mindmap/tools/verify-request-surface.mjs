/**
 * Check that the mind-map tool and its maintenance instruction really reached
 * the model request surface of this session.
 *
 * It decodes the session log and inspects the durable records that capture the
 * request surface: `system/message` (the assembled prompt) and `request/header`
 * (the frozen call configuration, whose `tools` array is the presented catalog).
 *
 * Usage:
 *   node tools/verify-request-surface.mjs <session.v4.jsonl.zstd>
 */

import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const path = process.argv[2]
if (path === undefined) {
  console.error('usage: node tools/verify-request-surface.mjs <session.v4.jsonl.zstd>')
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

/** Flatten message content into one searchable string. */
function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => (block !== null && typeof block === 'object' && typeof block.text === 'string' ? block.text : ''))
    .join('\n')
}

const events = decodeLog(path)
console.log('events:', events.length)

console.log('\n=== system/message (assembled prompt) ===')
for (const event of events) {
  if (event.type !== 'system/message') continue
  const text = textOf(event.data?.message?.content)
  console.log(
    `seq ${event.seq}  turn ${event.data?.turn}  step ${event.data?.step}  chars ${text.length}` +
      `  has-思维导图=${text.includes('思维导图')}  has-mindmap-tool-mention=${text.includes('`mindmap`')}`,
  )
}

console.log('\n=== request/header (frozen call config) ===')
for (const event of events) {
  if (event.type !== 'request/header') continue
  const tools = event.data?.header?.tools
  const names = Array.isArray(tools) ? tools.map((tool) => tool.name) : []
  const mine = Array.isArray(tools) ? tools.find((tool) => tool.name === 'mindmap') : undefined
  console.log(
    `seq ${event.seq}  reason ${event.data?.reason}  provider/model ${event.data?.header?.config?.provider}/${event.data?.header?.config?.model}` +
      `  tools ${names.length}  has-mindmap=${names.includes('mindmap')}`,
  )
  if (mine !== undefined) {
    console.log('  description:', mine.description?.slice(0, 120))
    console.log('  parameters required:', JSON.stringify(mine.parameters?.required))
    console.log('  node properties:', Object.keys(mine.parameters?.properties?.nodes?.items?.properties ?? {}).join(','))
  }
}
