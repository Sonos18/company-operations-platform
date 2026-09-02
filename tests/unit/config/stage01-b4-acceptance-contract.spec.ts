import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('B4 Cloud DEV acceptance boundary', () => {
  it('keeps its fixed isolated identity, secret-state boundary, and real-browser contract', () => {
    const fixture = read('scripts/stage01-b4-acceptance-fixture.mjs')
    const state = read('tests/acceptance/stage01-cloud-dev/acceptance-state.ts')
    const setup = read('tests/acceptance/stage01-cloud-dev/global-setup.ts')
    const teardown = read('tests/acceptance/stage01-cloud-dev/global-teardown.ts')
    const config = read('playwright.b4.config.ts')
    const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> }

    expect(fixture).toContain("'taskovia-b4-acceptance'")
    expect(fixture).toContain("'VQH_STAGE01_ACCEPTANCE'")
    expect(fixture).toContain("'b4000000-0000-4000-8000-000000000010'")
    expect(fixture).toContain("'b4000000-0000-4000-8000-000000000020'")
    expect(fixture).toContain('assertCloudDevTarget({ cwd })')
    expect(fixture).toContain('randomBytes')
    expect(state).toContain('acceptance-state.json')
    expect(state).toContain('acceptance-evidence.json')
    expect(setup).toContain('0o600')
    expect(teardown).toContain('finally')
    expect(config).toContain('4327')
    expect(config).toContain("testDir: './tests/acceptance/stage01-cloud-dev'")
    expect(config).toContain('timeout: 120_000')
    expect(config).toContain('pnpm dev --host 127.0.0.1 --port 4327')
    expect(packageJson.scripts['test:b4:cloud-dev']).toBe('playwright test --config=playwright.b4.config.ts')
  })

  it('forbids business-route replacement in full-stack acceptance specs', () => {
    const fullStackSpecs = [
      'tests/acceptance/stage01-cloud-dev/stage01-fullstack.spec.ts',
      'tests/acceptance/stage01-cloud-dev/stage01-performance.spec.ts',
    ].filter(path => existsSync(resolve(root, path)))

    for (const path of fullStackSpecs) {
      const source = read(path)
      expect(source).not.toContain('page.route(')
      expect(source).not.toContain('context.route(')
      expect(source).not.toContain('route.fulfill(')
    }
  })
})
