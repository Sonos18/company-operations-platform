import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const CANONICAL_DEV_PROJECT_REF = 'ykrurrumqlsxnqfqunjc'

function readRequiredFile(path, missingMessage) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') throw new Error(missingMessage, { cause: error })
    throw error
  }
}

function readEnvValue(envFile, name) {
  const line = envFile.split(/\r?\n/).find(item => item.startsWith(`${name}=`))
  const value = line?.slice(name.length + 1).trim()
  if (!value) throw new Error(`${name} is missing or empty`)
  return value
}

export function assertCloudDevTarget({ cwd = process.cwd() } = {}) {
  const linkedProjectRef = readRequiredFile(
    resolve(cwd, 'supabase/.temp/project-ref'),
    'Supabase CLI link state is missing',
  ).trim()
  if (linkedProjectRef !== CANONICAL_DEV_PROJECT_REF) {
    throw new Error('Linked project ref does not match canonical Cloud DEV target')
  }

  const envFile = readRequiredFile(resolve(cwd, '.env.local'), '.env.local is missing')
  const supabaseUrl = readEnvValue(envFile, 'NUXT_PUBLIC_SUPABASE_URL')
  readEnvValue(envFile, 'NUXT_PUBLIC_SUPABASE_ANON_KEY')

  let hostname
  try {
    hostname = new URL(supabaseUrl).hostname
  } catch {
    throw new Error('NUXT_PUBLIC_SUPABASE_URL is missing or invalid')
  }

  if (hostname !== `${CANONICAL_DEV_PROJECT_REF}.supabase.co`) {
    throw new Error('NUXT_PUBLIC_SUPABASE_URL does not match canonical Cloud DEV target')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertCloudDevTarget()
  console.log('Cloud DEV target guard passed.')
}
