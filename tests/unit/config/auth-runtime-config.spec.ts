import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadNuxtConfig } from 'nuxt/kit'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  scripts: Record<string, string>
}

function parseEnv(source: string): Record<string, string> {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .filter(line => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')

        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

describe('Taskovia auth runtime configuration', () => {
  it('registers Pinia, discovers app stores, and exposes the canonical local app URL', async () => {
    const nuxtConfig = await loadNuxtConfig({ cwd: root })
    const envExample = parseEnv(readFileSync(resolve(root, '.env.example'), 'utf8'))

    expect(packageJson.dependencies).toMatchObject({
      pinia: '4.0.3',
      '@pinia/nuxt': '1.0.2',
    })
    expect(packageJson.scripts.postinstall).toBe('nuxt prepare')
    expect(nuxtConfig.modules).toContain('@pinia/nuxt')
    expect(nuxtConfig.pinia).toMatchObject({
      storesDirs: ['./app/stores/**'],
    })
    expect(nuxtConfig.runtimeConfig.public).toMatchObject({
      appUrl: '',
      supabaseUrl: '',
      supabaseAnonKey: '',
    })
    expect(envExample.NUXT_PUBLIC_APP_URL).toBe('http://127.0.0.1:3000')
  })
})
