import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { CANONICAL_DEV_PROJECT_REF } from './assert-cloud-dev-target.mjs'

const CANONICAL_DEV_ORIGIN = `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co`

function readRequiredEnvironment(env, name) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} is missing or empty`)
  return value
}

function readJwtRole(value) {
  const parts = value.split('.')
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

function isAllowedAnonKey(value) {
  return /^sb_publishable_[A-Za-z0-9._-]+$/.test(value) || readJwtRole(value) === 'anon'
}

function isAllowedServiceRoleKey(value) {
  return /^sb_secret_[A-Za-z0-9._-]+$/.test(value) || readJwtRole(value) === 'service_role'
}

export function assertInstaCloudSandboxEnvironment({ env = process.env } = {}) {
  const supabaseUrl = readRequiredEnvironment(env, 'NUXT_PUBLIC_SUPABASE_URL')
  const anonKey = readRequiredEnvironment(env, 'NUXT_PUBLIC_SUPABASE_ANON_KEY')
  const serviceRoleKey = readRequiredEnvironment(env, 'NUXT_SUPABASE_SERVICE_ROLE_KEY')

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
    throw new Error('InstaCloud sandbox must target canonical Supabase Cloud DEV')
  }

  if (!isAllowedAnonKey(anonKey)) {
    throw new Error('NUXT_PUBLIC_SUPABASE_ANON_KEY is invalid for the sandbox')
  }

  if (!isAllowedServiceRoleKey(serviceRoleKey)) {
    throw new Error('NUXT_SUPABASE_SERVICE_ROLE_KEY is invalid for the sandbox')
  }

  if (anonKey === serviceRoleKey) {
    throw new Error('Sandbox public and service-role keys must be different')
  }

  return {
    projectRef: CANONICAL_DEV_PROJECT_REF,
    origin: CANONICAL_DEV_ORIGIN,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = assertInstaCloudSandboxEnvironment()
  console.log(`InstaCloud sandbox target guard passed for Supabase DEV ${target.projectRef}.`)
}
