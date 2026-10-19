/**
 * Print a numbered line range of a file inside an asar archive.
 *
 * Plain Node cannot read an asar; run this with the DSH Electron binary:
 *   $env:ELECTRON_RUN_AS_NODE='1'
 *   & 'D:\Software\DSH\DeepSeek Harness.exe' tools/read-asar.cjs <file> [start] [end]
 *
 * Usage: node tools/read-asar.cjs <file> [startLine=1] [endLine=start+199]
 */

const fs = require('node:fs')

const file = process.argv[2]
const start = Number(process.argv[3] ?? 1)
const end = Number(process.argv[4] ?? start + 199)
if (file === undefined) {
  console.error('usage: read-asar.cjs <file> [start] [end]')
  process.exit(2)
}

const lines = fs.readFileSync(file, 'utf8').split('\n')
const from = Math.max(1, start)
const to = Math.min(lines.length, end)
for (let index = from; index <= to; index += 1) {
  console.log(`${index}\t${lines[index - 1]}`)
}
console.log(`--- ${from}-${to} of ${lines.length} lines ---`)
