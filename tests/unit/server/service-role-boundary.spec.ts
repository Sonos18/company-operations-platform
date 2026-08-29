import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseUserClient } from '../../../server/utils/supabase-client'

const createClient = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const root = resolve(import.meta.dirname, '../../..')
const adminSecret = 'sb_secret_that_must_not_reach_user_queries'
const invitationRedirectTo = 'http://127.0.0.1:3000/auth/callback'
const historicalOnboardingMigration = 'supabase/migrations/20260818033418_employee_management_rbac.sql'
const forwardMigrationSuffix = '_harden_employee_onboarding_permissions.sql'

function filesRecursively(directory: string, extensions = new Set(['.ts'])): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory()
      ? filesRecursively(path, extensions)
      : extensions.has(extname(path)) ? [path] : []
  })
}

function authUser(index: number, email = `user-${index}@vqh.local`) {
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    email,
  }
}

function fullAuthPage(page: number) {
  return Array.from({ length: 100 }, (_, index) => authUser(((page - 1) * 100) + index + 1))
}

function authPage(users: unknown[]) {
  return { data: { users }, error: null }
}

function functionDefinition(source: string, declaration: string): string {
  const start = source.indexOf(declaration)
  const end = source.indexOf('$$;', start)
  if (start < 0 || end < 0) throw new Error(`Unable to find ${declaration}`)
  return source.slice(start, end + 3).replaceAll('\r\n', '\n')
}

function privateAdminSymbolFiles(files: Array<{ path: string, source: string }>): string[] {
  const symbols = [
    'supabaseServiceRoleKey',
    'serviceRoleKey',
    'createSupabaseAdminClient',
    'createSupabaseOffboardingAuthAdmin',
    'SupabaseAdminClient',
    'parseSupabaseAdminConfig',
  ]
  return files
    .filter(({ source }) => symbols.some(symbol => source.includes(symbol)))
    .map(({ path }) => path)
    .sort()
}

function forwardOnboardingMigrationPath(): string {
  const migrationsDirectory = resolve(root, 'supabase/migrations')
  const migration = readdirSync(migrationsDirectory)
    .filter(path => path.endsWith(forwardMigrationSuffix))
  if (migration.length !== 1) throw new Error('Expected exactly one forward onboarding hardening migration')
  return resolve(migrationsDirectory, migration[0]!)
}

async function adminFactory() {
  const module = await import('../../../server/utils/supabase-client') as Record<string, unknown>
  const factory = module.createSupabaseAdminClient
  expect(factory).toBeTypeOf('function')
  return typeof factory === 'function'
    ? factory as (config: { url: string, serviceRoleKey: string }) => unknown
    : undefined
}

async function invitationAuthAdapter() {
  const module = await import('../../../server/utils/supabase-client') as Record<string, unknown>
  const factory = module.createSupabaseInvitationAuthAdmin
  expect(factory).toBeTypeOf('function')
  return typeof factory === 'function'
    ? (client: unknown) => (factory as (client: unknown, options: { redirectTo: string }) => {
          inviteUser(email: string): Promise<unknown>
          findUserByEmail(email: string): Promise<unknown>
        })(client, { redirectTo: invitationRedirectTo })
    : undefined
}

async function offboardingAuthAdapter() {
  const module = await import('../../../server/utils/supabase-client') as Record<string, unknown>
  const factory = module.createSupabaseOffboardingAuthAdmin
  expect(factory).toBeTypeOf('function')
  return typeof factory === 'function'
    ? factory as (client: unknown) => { disableUser(userId: string): Promise<unknown> }
    : undefined
}

describe('Supabase Auth admin boundary', () => {
  beforeEach(() => {
    createClient.mockClear()
  })

  it('returns only the runtime Auth-admin façade without persisting a browser session', async () => {
    const rawAdmin = { inviteUserByEmail: vi.fn(), listUsers: vi.fn() }
    createClient.mockReturnValue({
      auth: { admin: rawAdmin },
      from: vi.fn(),
      rpc: vi.fn(),
      storage: { from: vi.fn() },
      functions: { invoke: vi.fn() },
    })
    const factory = await adminFactory()
    if (!factory) return

    const adminClient = factory({ url: 'http://127.0.0.1:54321', serviceRoleKey: adminSecret }) as Record<string, unknown>

    expect(createClient).toHaveBeenCalledWith(
      'http://127.0.0.1:54321',
      adminSecret,
      expect.objectContaining({
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      }),
    )
    expect(adminClient).toEqual({ auth: { admin: rawAdmin } })
    expect(adminClient).not.toHaveProperty('from')
    expect(adminClient).not.toHaveProperty('rpc')
    expect(adminClient).not.toHaveProperty('storage')
    expect(adminClient).not.toHaveProperty('functions')
  })

  it('never forwards a private admin credential to a regular caller-JWT client', () => {
    createClient.mockReturnValue({})
    createSupabaseUserClient({
      url: 'http://127.0.0.1:54321',
      anonKey: 'public-anon-key',
      serviceRoleKey: adminSecret,
    } as never, 'verified-caller-jwt')

    expect(createClient).toHaveBeenCalledWith(
      'http://127.0.0.1:54321',
      'public-anon-key',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer verified-caller-jwt' } },
      }),
    )
    expect(JSON.stringify(createClient.mock.calls)).not.toContain(adminSecret)
  })

  it('resolves one exact normalized retry user only after completing a valid page traversal', async () => {
    const adapterFactory = await invitationAuthAdapter()
    if (!adapterFactory) return
    const firstPage = fullAuthPage(1)
    firstPage[0] = authUser(1, ' Retry@VQH.Local ')
    const listUsers = vi.fn()
      .mockResolvedValueOnce({ data: { users: firstPage, nextPage: 1 }, error: null })
      .mockResolvedValueOnce(authPage([]))
    const admin = adapterFactory({ auth: { admin: { inviteUserByEmail: vi.fn(), listUsers } } })

    await expect(admin.findUserByEmail(' retry@vqh.local ')).resolves.toEqual({
      kind: 'found',
      userId: '10000000-0000-4000-8000-000000000001',
    })
    expect(listUsers).toHaveBeenNthCalledWith(1, { page: 1, perPage: 100 })
    expect(listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 100 })
  })

  it('fails closed when the same normalized email occurs twice in one Auth page', async () => {
    const adapterFactory = await invitationAuthAdapter()
    if (!adapterFactory) return
    const admin = adapterFactory({
      auth: {
        admin: {
          inviteUserByEmail: vi.fn(),
          listUsers: vi.fn().mockResolvedValue(authPage([
            authUser(11, 'retry@vqh.local'),
            authUser(12, ' Retry@VQH.Local '),
          ])),
        },
      },
    })

    await expect(admin.findUserByEmail('retry@vqh.local')).resolves.toEqual({ kind: 'failed' })
  })

  it('fails closed when the same normalized email occurs on different Auth pages', async () => {
    const adapterFactory = await invitationAuthAdapter()
    if (!adapterFactory) return
    const firstPage = fullAuthPage(1)
    firstPage[0] = authUser(1, 'retry@vqh.local')
    const listUsers = vi.fn()
      .mockResolvedValueOnce(authPage(firstPage))
      .mockResolvedValueOnce(authPage([authUser(101, ' Retry@VQH.Local ')]))
    const admin = adapterFactory({ auth: { admin: { inviteUserByEmail: vi.fn(), listUsers } } })

    await expect(admin.findUserByEmail('retry@vqh.local')).resolves.toEqual({ kind: 'failed' })
    expect(listUsers).toHaveBeenCalledTimes(2)
  })

  it.each([
    [{ id: authUser(1).id }, 'a returned user without an email'],
    [{ id: 'not-a-uuid', email: 'other@vqh.local' }, 'a returned user with an invalid ID'],
  ])('fails closed for %s', async (malformedUser) => {
    const adapterFactory = await invitationAuthAdapter()
    if (!adapterFactory) return
    const admin = adapterFactory({
      auth: { admin: { inviteUserByEmail: vi.fn(), listUsers: vi.fn().mockResolvedValue(authPage([malformedUser])) } },
    })

    await expect(admin.findUserByEmail('retry@vqh.local')).resolves.toEqual({ kind: 'failed' })
  })

  it('returns not_found only after a complete valid traversal including an empty final-page probe', async () => {
    const adapterFactory = await invitationAuthAdapter()
    if (!adapterFactory) return
    const listUsers = vi.fn()
      .mockResolvedValueOnce(authPage(fullAuthPage(1)))
      .mockResolvedValueOnce(authPage([]))
    const admin = adapterFactory({ auth: { admin: { inviteUserByEmail: vi.fn(), listUsers } } })

    await expect(admin.findUserByEmail('retry@vqh.local')).resolves.toEqual({ kind: 'not_found' })
    expect(listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 100 })
  })

  it('uses explicit numeric pages through page ten instead of an Auth nextPage value', async () => {
    const adapterFactory = await invitationAuthAdapter()
    if (!adapterFactory) return
    const listUsers = vi.fn().mockImplementation(({ page }: { page: number }) => {
      if (page < 10) return Promise.resolve({ data: { users: fullAuthPage(page), nextPage: 1 }, error: null })
      return Promise.resolve(authPage([authUser(1001, 'Retry@VQH.Local')]))
    })
    const admin = adapterFactory({ auth: { admin: { inviteUserByEmail: vi.fn(), listUsers } } })

    await expect(admin.findUserByEmail('retry@vqh.local')).resolves.toEqual({
      kind: 'found',
      userId: '10000000-0000-4000-8000-000000001001',
    })
    expect(listUsers).toHaveBeenNthCalledWith(10, { page: 10, perPage: 100 })
  })

  it('fails closed for a repeating Auth page cycle', async () => {
    const adapterFactory = await invitationAuthAdapter()
    if (!adapterFactory) return
    const repeatedPage = fullAuthPage(1)
    const listUsers = vi.fn()
      .mockResolvedValueOnce(authPage(repeatedPage))
      .mockResolvedValueOnce(authPage(repeatedPage))
    const admin = adapterFactory({ auth: { admin: { inviteUserByEmail: vi.fn(), listUsers } } })

    await expect(admin.findUserByEmail('retry@vqh.local')).resolves.toEqual({ kind: 'failed' })
  })

  it('fails closed when one hundred full Auth pages exhaust the traversal cap', async () => {
    const adapterFactory = await invitationAuthAdapter()
    if (!adapterFactory) return
    const listUsers = vi.fn().mockImplementation(({ page }: { page: number }) => Promise.resolve(authPage(fullAuthPage(page))))
    const admin = adapterFactory({ auth: { admin: { inviteUserByEmail: vi.fn(), listUsers } } })

    await expect(admin.findUserByEmail('retry@vqh.local')).resolves.toEqual({ kind: 'failed' })
    expect(listUsers).toHaveBeenCalledTimes(100)
  })

  it('fails closed when Auth user pagination errors instead of accepting an unrelated user', async () => {
    const adapterFactory = await invitationAuthAdapter()
    if (!adapterFactory) return
    const admin = adapterFactory({
      auth: {
        admin: {
          inviteUserByEmail: vi.fn(),
          listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: { message: 'provider detail' } }),
        },
      },
    })

    await expect(admin.findUserByEmail('retry@vqh.local')).resolves.toEqual({ kind: 'failed' })
  })

  it('recognizes only documented duplicate invite codes and otherwise hides provider details', async () => {
    const adapterFactory = await invitationAuthAdapter()
    if (!adapterFactory) return
    const listUsers = vi.fn()
    const inviteUserByEmail = vi.fn()
      .mockResolvedValueOnce({ data: { user: null }, error: { status: 422, code: 'email_exists', message: 'existing user detail' } })
      .mockResolvedValueOnce({ data: { user: null }, error: { status: 422, code: 'invalid_email', message: 'secret provider detail' } })
    const admin = adapterFactory({ auth: { admin: { inviteUserByEmail, listUsers } } })

    await expect(admin.inviteUser('retry@vqh.local')).resolves.toEqual({ kind: 'existing' })
    await expect(admin.inviteUser('retry@vqh.local')).resolves.toEqual({ kind: 'failed' })
    expect(listUsers).not.toHaveBeenCalled()
  })

  it('closes the canonical callback redirect into normalized invitation requests', async () => {
    const adapterFactory = await invitationAuthAdapter()
    if (!adapterFactory) return
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: { id: authUser(1).id } },
      error: null,
    })
    const admin = adapterFactory({ auth: { admin: { inviteUserByEmail, listUsers: vi.fn() } } })

    await expect(admin.inviteUser(' Invitee@VQH.Local ')).resolves.toEqual({
      kind: 'invited',
      userId: authUser(1).id,
    })
    expect(inviteUserByEmail).toHaveBeenCalledWith('invitee@vqh.local', {
      redirectTo: invitationRedirectTo,
    })
  })

  it('uses the narrow Auth-only adapter to disable an account with an explicit non-destructive ban duration', async () => {
    const adapterFactory = await offboardingAuthAdapter()
    if (!adapterFactory) return
    const updateUserById = vi.fn().mockResolvedValue({
      data: { user: { id: authUser(1).id } },
      error: null,
    })
    const adapter = adapterFactory({ auth: { admin: { updateUserById } } })

    await expect(adapter.disableUser(authUser(1).id)).resolves.toEqual({ kind: 'disabled' })
    expect(updateUserById).toHaveBeenCalledWith(authUser(1).id, { ban_duration: '876000h' })
  })

  it('hides Auth disable provider failures behind the narrow failed result', async () => {
    const adapterFactory = await offboardingAuthAdapter()
    if (!adapterFactory) return
    const adapter = adapterFactory({
      auth: {
        admin: {
          updateUserById: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'secret provider detail' },
          }),
        },
      },
    })

    await expect(adapter.disableUser(authUser(1).id)).resolves.toEqual({ kind: 'failed' })
  })

  it('allows private Auth-admin symbols only in the exact server-side assembly allowlist', () => {
    const files = [
      resolve(root, 'nuxt.config.ts'),
      ...filesRecursively(resolve(root, 'server'), new Set(['.ts'])),
      ...filesRecursively(resolve(root, 'app'), new Set(['.ts', '.vue'])),
      ...filesRecursively(resolve(root, 'shared'), new Set(['.ts', '.vue'])),
    ].map(path => ({
      path: relative(root, path).replaceAll('\\', '/'),
      source: readFileSync(path, 'utf8'),
    }))

    expect(privateAdminSymbolFiles(files)).toEqual([
      'nuxt.config.ts',
      'server/features/employees/employee.routes.ts',
      'server/utils/supabase-client.ts',
      'server/utils/supabase-config.ts',
    ])
    expect(privateAdminSymbolFiles([
      { path: 'server/api/leak.post.ts', source: 'runtime.supabaseServiceRoleKey' },
    ])).toEqual(['server/api/leak.post.ts'])
  })

  it('limits Auth-admin factory imports to dependency assembly and its server-only façade', () => {
    const importers = filesRecursively(resolve(root, 'server'))
      .filter(path => readFileSync(path, 'utf8').includes('createSupabaseAdminClient'))
      .map(path => relative(root, path).replaceAll('\\', '/'))

    expect(importers).toEqual([
      'server/features/employees/employee.routes.ts',
      'server/utils/supabase-client.ts',
    ])
  })

  it('keeps every Stage 01 request-path feature on the caller-scoped Supabase client', () => {
    const stage01RequestPathSources = [
      'server/features/opportunities',
      'server/features/workflow',
      'server/features/stage01',
    ].flatMap(directory => filesRecursively(resolve(root, directory)))
      .map(path => readFileSync(path, 'utf8'))
      .join('\n')

    expect(stage01RequestPathSources).not.toMatch(/service[_-]?role|createSupabaseAdminClient/u)
  })

  it('keeps the historical onboarding migration unchanged from the Task 8 baseline', () => {
    const historical = readFileSync(resolve(root, historicalOnboardingMigration), 'utf8')
    const baseline = execFileSync(
      'git',
      ['show', `f233899:${historicalOnboardingMigration}`],
      { cwd: root, encoding: 'utf8' },
    )

    expect(historical.replace(/\r\n?/g, '\n')).toBe(baseline.replace(/\r\n?/g, '\n'))
  })

  it('uses one forward migration to replace only the private onboarding permission check', () => {
    const historical = readFileSync(resolve(root, historicalOnboardingMigration), 'utf8')
    const forward = readFileSync(forwardOnboardingMigrationPath(), 'utf8')
    const privateDeclaration = 'create or replace function private.complete_employee_onboarding('
    const publicDeclaration = 'create or replace function public.complete_employee_onboarding('
    const historicalPrivate = functionDefinition(historical, privateDeclaration)
    const forwardPrivate = functionDefinition(forward, privateDeclaration)
    const expectedPrivate = historicalPrivate.replace(
      "     or not private.has_company_permission(v_tenant_id, target_company_id, 'employee.create') then",
      "     or not private.has_company_permission(v_tenant_id, target_company_id, 'account.invite')\n     or not private.has_company_permission(v_tenant_id, target_company_id, 'employee.create') then",
    )

    expect(forwardPrivate).toBe(expectedPrivate)
    expect(functionDefinition(forward, publicDeclaration)).toBe(functionDefinition(historical, publicDeclaration))
    expect(forward).toContain('revoke all on function private.complete_employee_onboarding(uuid, uuid, text, text, text, uuid, uuid, date) from public, anon, authenticated;')
    expect(forward).toContain('grant execute on function private.complete_employee_onboarding(uuid, uuid, text, text, text, uuid, uuid, date) to authenticated;')
    expect(forward).toContain('revoke all on function public.complete_employee_onboarding(uuid, uuid, text, text, text, uuid, uuid, date) from public, anon;')
    expect(forward).toContain('grant execute on function public.complete_employee_onboarding(uuid, uuid, text, text, text, uuid, uuid, date) to authenticated;')
  })
})
