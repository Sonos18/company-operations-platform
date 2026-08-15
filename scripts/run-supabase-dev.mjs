import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const SUPABASE_DEV_HOME_SEGMENTS = ['SupabaseCLI', 'company-operations-dev']

export function resolveSupabaseDevHome({ env = process.env, platform = process.platform } = {}) {
  const stateHome = platform === 'win32'
    ? env.LOCALAPPDATA ?? (env.USERPROFILE ? join(env.USERPROFILE, 'AppData', 'Local') : undefined) ?? env.APPDATA
    : env.XDG_STATE_HOME ?? (env.HOME ? join(env.HOME, '.local', 'state') : undefined)

  if (!stateHome) throw new Error('A stable local directory is required for isolated Supabase CLI authentication')
  return join(stateHome, ...SUPABASE_DEV_HOME_SEGMENTS)
}

export function runSupabaseDevCli(cliArgs, {
  cwd = process.cwd(),
  env = process.env,
  platform = process.platform,
  spawn = spawnSync,
} = {}) {
  const cliEntrypoint = resolve(cwd, 'node_modules/supabase/dist/supabase.js')
  return spawn(process.execPath, [cliEntrypoint, ...cliArgs], {
    cwd,
    env: { ...env, SUPABASE_HOME: resolveSupabaseDevHome({ env, platform }) },
    stdio: 'inherit',
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runSupabaseDevCli(process.argv.slice(2))
  if (result.error) throw result.error
  if (result.status !== 0) process.exitCode = result.status ?? 1
}
