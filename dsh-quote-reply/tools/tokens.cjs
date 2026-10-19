/**
 * Print every theme-token name referenced in one file (asar paths welcome).
 *
 * Plain Node cannot read an asar; run this with the DSH Electron binary:
 *   $env:ELECTRON_RUN_AS_NODE='1'
 *   & 'D:\Software\DSH\DeepSeek Harness.exe' tools/tokens.cjs <file> [nameFilter]
 *
 * Usage: node tools/tokens.cjs <file> [substring]
 */

const fs = require('node:fs')

const file = process.argv[2]
const filter = process.argv[3]
if (file === undefined) {
  console.error('usage: tokens.cjs <file> [substring]')
  process.exit(2)
}

const text = fs.readFileSync(file, 'utf8')
const names = new Set()
for (const match of text.matchAll(/--dsw-[a-z0-9-]+/gu)) {
  if (filter === undefined || match[0].includes(filter)) names.add(match[0])
}
for (const name of [...names].sort()) console.log(name)
console.log(`--- ${names.size} token name(s) ---`)
