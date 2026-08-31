#!/usr/bin/env node
/** The `codedocs` entry point. Node 24 runs this TypeScript directly. */

import { run } from './main.ts'

const { stdout, stderr, code } = run(process.argv.slice(2))
if (stdout !== '') process.stdout.write(`${stdout}\n`)
if (stderr !== '') process.stderr.write(`${stderr}\n`)
process.exitCode = code
