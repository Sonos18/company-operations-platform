import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function runModeProcess(mode, { cwd = process.cwd() } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [resolve(cwd, 'scripts/run-supabase-dev.mjs'), mode],
      { cwd, stdio: 'inherit' },
    )
    child.once('error', rejectPromise)
    child.once('close', (code) => {
      if (code === 0) resolvePromise()
      else rejectPromise(new Error(`Stage 01 concurrency mode ${mode} failed`))
    })
  })
}

export async function runStage01CloudDevConcurrency({
  runMode = mode => runModeProcess(mode),
} = {}) {
  await runMode('stage01-concurrency-cleanup')
  let bodyError
  try {
    await runMode('stage01-concurrency-setup')
    const actors = await Promise.allSettled([
      runMode('stage01-concurrency-actor-a'),
      runMode('stage01-concurrency-actor-b'),
    ])
    const successCount = actors.filter(result => result.status === 'fulfilled').length
    if (successCount !== 1) throw new Error('Stage 01 concurrency requires exactly one actor must succeed')
    await runMode('stage01-concurrency-assert')
  } catch (error) {
    bodyError = error
  }

  await runMode('stage01-concurrency-cleanup')
  if (bodyError) throw bodyError
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Unsupported Stage 01 concurrency operation')
  await runStage01CloudDevConcurrency()
}
