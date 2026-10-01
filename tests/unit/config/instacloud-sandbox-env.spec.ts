import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertInstaCloudSandboxEnvironment,
} from '../../../scripts/assert-instacloud-sandbox-env.mjs'
import { CANONICAL_DEV_PROJECT_REF } from '../../../scripts/assert-cloud-dev-target.mjs'

const root = resolve(import.meta.dirname, '../../..')

function validEnvironment() {
  return {
    NUXT_PUBLIC_SUPABASE_URL: `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co`,
    NUXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test-key',
    NUXT_SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test-key',
  }
}

describe('InstaCloud sandbox environment guard', () => {
  it('accepts only the canonical Supabase Cloud DEV target', () => {
    expect(assertInstaCloudSandboxEnvironment({ env: validEnvironment() })).toEqual({
      projectRef: CANONICAL_DEV_PROJECT_REF,
      origin: `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co`,
    })
  })

  it('rejects a different Supabase project', () => {
    expect(() => assertInstaCloudSandboxEnvironment({
      env: {
        ...validEnvironment(),
        NUXT_PUBLIC_SUPABASE_URL: 'https://wrongprojectref.supabase.co',
      },
    })).toThrow('InstaCloud sandbox must target canonical Supabase Cloud DEV')
  })

  it.each([
    `http://${CANONICAL_DEV_PROJECT_REF}.supabase.co`,
    `https://user:password@${CANONICAL_DEV_PROJECT_REF}.supabase.co`,
    `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co:8443`,
    `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co/not-allowed`,
    `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co?query=not-allowed`,
    `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co#fragment-not-allowed`,
  ])('rejects a non-canonical Supabase URL shape', url => {
    expect(() => assertInstaCloudSandboxEnvironment({
      env: { ...validEnvironment(), NUXT_PUBLIC_SUPABASE_URL: url },
    })).toThrow('InstaCloud sandbox must target canonical Supabase Cloud DEV')
  })

  it('rejects missing or swapped public and privileged keys', () => {
    const withoutServiceRole = validEnvironment()
    delete withoutServiceRole.NUXT_SUPABASE_SERVICE_ROLE_KEY

    expect(() => assertInstaCloudSandboxEnvironment({
      env: withoutServiceRole,
    })).toThrow('NUXT_SUPABASE_SERVICE_ROLE_KEY is missing or empty')

    expect(() => assertInstaCloudSandboxEnvironment({
      env: {
        ...validEnvironment(),
        NUXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_wrong-slot',
      },
    })).toThrow('NUXT_PUBLIC_SUPABASE_ANON_KEY is invalid for the sandbox')

    expect(() => assertInstaCloudSandboxEnvironment({
      env: {
        ...validEnvironment(),
        NUXT_SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_wrong-slot',
      },
    })).toThrow('NUXT_SUPABASE_SERVICE_ROLE_KEY is invalid for the sandbox')
  })

  it('rejects reusing the same key for public and privileged access', () => {
    expect(() => assertInstaCloudSandboxEnvironment({
      env: {
        ...validEnvironment(),
        NUXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_same',
        NUXT_SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_same',
      },
    })).toThrow('NUXT_SUPABASE_SERVICE_ROLE_KEY is invalid for the sandbox')
  })

  it('keeps the container startup fail-closed before Nitro starts', () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8')
    const dockerignore = readFileSync(resolve(root, '.dockerignore'), 'utf8')

    expect(packageJson.scripts['instacloud:sandbox:guard'])
      .toBe('node scripts/assert-instacloud-sandbox-env.mjs')
    expect(packageJson.scripts['instacloud:sandbox:start'])
      .toBe('node scripts/assert-instacloud-sandbox-env.mjs && node .output/server/index.mjs')

    expect(dockerfile).toContain('NITRO_HOST=0.0.0.0')
    expect(dockerfile).toContain('NITRO_PORT=3000')
    expect(dockerfile).toContain(
      'node scripts/assert-instacloud-sandbox-env.mjs && node .output/server/index.mjs',
    )

    expect(dockerignore).toMatch(/^\.env$/m)
    expect(dockerignore).toMatch(/^\.env\.\*$/m)
    expect(dockerignore).toMatch(/^\*\.local$/m)
  })
})
