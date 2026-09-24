import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { evaluateTypeSafe } from './lib/typesafe-jev-client.mjs'
import {
  DEFAULT_JEV_ROUTER_MODEL,
  buildJevRouterRequest,
  hashRouterState,
  summarizeJevRouterResponse,
  validateRouterState,
} from './jev-router-core.mjs'

const DEFAULT_LOG_PATH = '.jev-router-shadow/decisions.jsonl'

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function fail(message) {
  console.error(message)
  process.exitCode = 1
}

function parseArgs(argv) {
  const args = [...argv]
  let logPath = DEFAULT_LOG_PATH
  let writeLog = true
  let model = process.env.JEV_ROUTER_MODEL?.trim() || DEFAULT_JEV_ROUTER_MODEL
  let inputPath

  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--no-log') {
      writeLog = false
    } else if (arg === '--log') {
      const value = args.shift()
      if (!value) throw new Error('--log requires a path')
      logPath = value
    } else if (arg === '--model') {
      const value = args.shift()
      if (!value) throw new Error('--model requires a model id')
      model = value
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`)
    } else if (inputPath === undefined) {
      inputPath = arg
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!inputPath) {
    throw new Error('Usage: node scripts/run-jev-router-shadow.mjs <state.json> [--no-log] [--log <path>] [--model <id>]')
  }

  return { inputPath, logPath, writeLog, model }
}

async function readState(path) {
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    throw new Error(`Cannot read Jev router state file: ${errorMessage(error)}`, { cause: error })
  }

  let state
  try {
    state = JSON.parse(source)
  } catch (error) {
    throw new Error(`Invalid Jev router state JSON: ${errorMessage(error)}`, { cause: error })
  }
  validateRouterState(state)
  return state
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const state = await readState(options.inputPath)
  const stateSha256 = hashRouterState(state)
  const request = buildJevRouterRequest(state, options.model)
  const { result, elapsedMs, attempts } = await evaluateTypeSafe(request)
  const summary = summarizeJevRouterResponse(result, { stateSha256, elapsedMs, attempts })

  if (options.writeLog) {
    const logPath = resolve(options.logPath)
    await mkdir(dirname(logPath), { recursive: true })
    const logEntry = {
      recordedAt: new Date().toISOString(),
      ...summary,
    }
    await appendFile(logPath, `${JSON.stringify(logEntry)}\n`, 'utf8')
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main().catch(error => fail(errorMessage(error)))
