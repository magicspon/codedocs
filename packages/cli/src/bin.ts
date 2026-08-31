#!/usr/bin/env node
/** The `codedocs` entry point. Node 24 runs this TypeScript directly. */

import { run } from './main.ts'
import { serve } from './mcp.ts'

// `mcp` is not an operation: it is a server that binds them, so it owes no
// envelope and does not go through the parser that produces one.
if (process.argv[2] === 'mcp') {
  await serve(process.stdin, process.stdout)
} else {
  const { stdout, stderr, code } = run(process.argv.slice(2))
  if (stdout !== '') process.stdout.write(`${stdout}\n`)
  if (stderr !== '') process.stderr.write(`${stderr}\n`)
  process.exitCode = code
}
