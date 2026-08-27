import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const CANONICAL_DEV_PROJECT_REF = 'gtgljlnhwvhqdnwrfdfj'
const CANONICAL_DEV_ORIGIN = `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co`

function readRequiredFile(path, missingMessage) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') throw new Error(missingMessage, { cause: error })
    throw error
  }
}

function readEnvValue(envFile, name) {
  const assignments = envFile.split(/\r?\n/).filter(line => line.startsWith(`${name}=`))
  if (assignments.length !== 1) throw new Error(`${name} must be assigned exactly once`)
  const value = assignments[0].slice(name.length + 1).trim()
  if (!value) throw new Error(`${name} is missing or empty`)
  return value
}

function isLegacyAnonJwt(value) {
  const parts = value.split('.')
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return false
  try {
    JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return payload.role === 'anon'
  } catch {
    return false
  }
}

function isAllowedAnonKey(value) {
  return /^sb_publishable_[A-Za-z0-9._-]+$/.test(value) || isLegacyAnonJwt(value)
}

export function assertCloudDevEnvironment({ cwd = process.cwd() } = {}) {
  const envFile = readRequiredFile(resolve(cwd, '.env.local'), '.env.local is missing')
  const supabaseUrl = readEnvValue(envFile, 'NUXT_PUBLIC_SUPABASE_URL')
  const anonKey = readEnvValue(envFile, 'NUXT_PUBLIC_SUPABASE_ANON_KEY')

  let parsedUrl
  try {
    parsedUrl = new URL(supabaseUrl)
  } catch {
    throw new Error('NUXT_PUBLIC_SUPABASE_URL is missing or invalid')
  }
  if (
    parsedUrl.origin !== CANONICAL_DEV_ORIGIN
    || parsedUrl.username
    || parsedUrl.password
    || parsedUrl.port
    || parsedUrl.pathname !== '/'
    || parsedUrl.search
    || parsedUrl.hash
  ) {
    throw new Error('NUXT_PUBLIC_SUPABASE_URL does not match canonical Cloud DEV target')
  }
  if (!isAllowedAnonKey(anonKey)) throw new Error('NUXT_PUBLIC_SUPABASE_ANON_KEY is invalid')
}

export function assertCloudDevTarget({ cwd = process.cwd() } = {}) {
  assertCloudDevEnvironment({ cwd })
  const linkedProjectRef = readRequiredFile(
    resolve(cwd, 'supabase/.temp/project-ref'),
    'Supabase CLI link state is missing',
  ).trim()
  if (linkedProjectRef !== CANONICAL_DEV_PROJECT_REF) {
    throw new Error('Linked project ref does not match canonical Cloud DEV target')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertCloudDevTarget()
  console.log('Cloud DEV target guard passed.')
}
