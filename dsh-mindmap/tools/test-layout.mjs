/**
 * Geometry check for the client half's layout engine.
 *
 * `client.js` cannot be imported (it registers into the browser module loader),
 * so this reads the shipped source, extracts the pure layout region between its
 * markers, evaluates exactly that text, and asserts the invariants a mind-map
 * layout must hold on a real graph. It renders nothing and touches no DOM.
 *
 * Usage:
 *   node tools/test-layout.mjs <session.v4.jsonl.zstd> [--dump]
 */

import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const sessionPath = process.argv[2]
const dump = process.argv.includes('--dump')
if (sessionPath === undefined) {
  console.error('usage: node tools/test-layout.mjs <session.v4.jsonl.zstd> [--dump]')
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

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const start = source.indexOf('// #region pure layout')
const end = source.indexOf('// #endregion pure layout')
if (start === -1 || end === -1) {
  console.error('FAIL: client.js lost its "// #region pure layout" markers')
  process.exit(1)
}
const region = source.slice(start, end)
const factory = new Function(
  `${region}
   return { buildLayout, estimateTextWidth, nodeWidth, ROW, NODE_H, VGAP, HGAP, PAD, MIN_NODE_W, MAX_NODE_W }`,
)
const api = factory()

const events = decodeLog(sessionPath)
let graph = null
for (const event of events) {
  if (event.type !== 'tool/call' || event.data?.name !== 'mindmap') continue
  try {
    const args = JSON.parse(event.data.arguments)
    if (Array.isArray(args?.nodes) && args.nodes.length > 0) graph = args
  } catch {
    /* ignore a call whose arguments cannot be read */
  }
}
if (graph === null) {
  console.error('FAIL: no mindmap call in this log')
  process.exit(1)
}
console.log(`graph: "${graph.title}" nodes=${graph.nodes.length} links=${(graph.links ?? []).length}`)

const layout = api.buildLayout(graph, new Set())
const failures = []
const check = (label, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(label)
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value)
check('every node has finite geometry', layout.rows.every((node) => finite(node.x) && finite(node.y) && finite(node.w)))
check('canvas is finite and non-empty', layout.width > 0 && layout.height > 0 && finite(layout.width) && finite(layout.height))
check(
  'every node is inside the canvas',
  layout.rows.every((node) => node.x >= 0 && node.y >= 0 && node.x + node.w <= layout.width && node.y + api.NODE_H <= layout.height),
  `canvas ${layout.width}x${layout.height}`,
)

let overlaps = 0
for (let i = 0; i < layout.rows.length; i += 1) {
  for (let j = i + 1; j < layout.rows.length; j += 1) {
    const a = layout.rows[i]
    const b = layout.rows[j]
    const gapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const gapY = Math.min(a.y + api.NODE_H, b.y + api.NODE_H) - Math.max(a.y, b.y)
    if (gapX > 0 && gapY > 0) overlaps += 1
  }
}
check('no two nodes overlap', overlaps === 0, `overlaps=${overlaps}`)

const sides = { left: 0, right: 0 }
for (const node of layout.rows) if (node.side === 'left' || node.side === 'right') sides[node.side] += 1
const branchCount = layout.rows.filter((node) => node.depth === 1).length
check('both halves used at level 1', branchCount < 2 || (sides.left > 0 && sides.right > 0), `left=${sides.left} right=${sides.right}`)

const byDepth = new Map()
for (const node of layout.rows) {
  if (!byDepth.has(node.depth)) byDepth.set(node.depth, [])
  byDepth.get(node.depth).push(node)
}
let ordered = true
for (const [, group] of byDepth) {
  const right = group.filter((node) => node.side === 'right')
  const left = group.filter((node) => node.side === 'left')
  for (let i = 1; i < right.length; i += 1) if (right[i].x < right[i - 1].x) ordered = false
  for (let i = 1; i < left.length; i += 1) if (left[i].x > left[i - 1].x) ordered = false
}
check('depth 0 marks the centre', layout.rows.filter((node) => node.depth === 0 && node.side === 'centre').length === 1)

const root = layout.rows.find((node) => node.side === 'centre')
check('centre sits between the halves', layout.rows.every((node) => (node.side === 'left' ? node.x + node.w <= root.x + 1 : node.side === 'right' ? node.x >= root.x + root.w - 1 : true)))

const edgesOk = layout.edges.every((edge) =>
  edge.from.depth === undefined
    ? false
    : edge.to.depth === edge.from.depth + 1 && (edge.from.side === 'centre' || edge.to.side === edge.from.side),
)
check('every edge goes one depth outward on its own side', edgesOk, `edges=${layout.edges.length}`)
check('edge count matches the tree', layout.edges.length === layout.rows.length - 1, `${layout.edges.length} vs ${layout.rows.length - 1}`)

const widths = layout.rows.map((node) => api.estimateTextWidth(node.label) + api.NODE_CHROME)
const truncated = layout.rows.filter((node, index) => widths[index] > node.w + 1)
check('no label is wider than its box (up to the cap)', truncated.length === 0, `capped=${truncated.length}`)

// Collapsing must hide a subtree, never re-attach it somewhere else. The first
// version promoted hidden descendants to top-level branches and the map fell
// apart, so both shapes below are regressions worth keeping.
const branch = layout.rows.find((node) => node.depth === 1 && node.kids.length > 0)
if (branch !== undefined) {
  const hidden = new Set()
  const collectIds = (node) => {
    for (const child of node.kids) {
      hidden.add(child.id)
      collectIds(child)
    }
  }
  collectIds(branch)
  const collapsedLayout = api.buildLayout(graph, new Set([branch.id]))
  const ids = collapsedLayout.rows.map((node) => node.id)
  const collapsedNode = collapsedLayout.rows.find((node) => node.id === branch.id)
  check(
    'collapsing hides the subtree',
    hidden.size > 0 && [...hidden].every((id) => !ids.includes(id)),
    `branch=${branch.id} hidden=${hidden.size}`,
  )
  check('collapsing keeps every other node once', new Set(ids).size === ids.length && ids.length === layout.rows.length - hidden.size)
  check('collapsed node reports its hidden children', collapsedNode?.hiddenChildren === hidden.size, `badge=${collapsedNode?.hiddenChildren}`)
  const collapsedOverlap = collapsedLayout.rows.some((a, index) =>
    collapsedLayout.rows.slice(index + 1).some((b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + api.NODE_H, b.y + api.NODE_H) - Math.max(a.y, b.y) > 0),
  )
  check('collapsed layout still has no overlap', collapsedOverlap === false)

  const root = layout.rows.find((node) => node.depth === 0)
  const rootCollapsed = api.buildLayout(graph, new Set([root.id]))
  check('collapsing the centre leaves only the centre', rootCollapsed.rows.length === 1, `rows=${rootCollapsed.rows.length}`)
}

if (dump) {
  console.log('\nrows:')
  for (const node of layout.rows) {
    console.log(
      `  d${node.depth} ${String(node.side).padEnd(6)} x=${node.x.toFixed(0).padStart(5)} y=${node.y
        .toFixed(0)
        .padStart(4)} w=${node.w} ${node.color ?? ''}  ${node.label}`,
    )
  }
}

console.log(failures.length === 0 ? '\nOK' : `\nFAILURES: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
