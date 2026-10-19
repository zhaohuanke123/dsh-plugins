/**
 * Search packaged JS inside an asar archive.
 *
 * Plain Node cannot read an asar; run this with the DSH Electron binary:
 *   ELECTRON_RUN_AS_NODE=1 "DeepSeek Harness.exe" tools/grep-asar.cjs <dir> <needle> [limit]
 *
 * Usage: node tools/grep-asar.cjs <dir> <needle> [limit]
 */

const fs = require('node:fs')
const path = require('node:path')

const root = process.argv[2]
const needle = process.argv[3]
const limit = Number(process.argv[4] ?? 30)
if (root === undefined || needle === undefined) {
  console.error('usage: grep-asar.cjs <dir> <needle> [limit]')
  process.exit(2)
}

/** @returns {string[]} every .js file below `dir`. */
function walk(dir, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

const files = walk(root)
let shown = 0
for (const file of files) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    continue
  }
  let from = 0
  for (;;) {
    const index = text.indexOf(needle, from)
    if (index === -1) break
    from = index + needle.length
    if (shown >= limit) break
    shown += 1
    const line = text.slice(0, index).split('\n').length
    const start = Math.max(0, index - 220)
    const snippet = text.slice(start, index + needle.length + 220).replace(/\s+/g, ' ')
    console.log(`\n### ${file.replace(root, '.')} :line ${line}`)
    console.log(snippet)
  }
  if (shown >= limit) break
}
console.log(`\n--- ${shown} hit(s), scanned ${files.length} files ---`)
