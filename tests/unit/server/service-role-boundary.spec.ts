import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseUserClient } from '../../../server/utils/supabase-client'

const createClient = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const root = resolve(import.meta.dirname, '../../..')
const adminSecret = 'sb_secret_that_must_not_reach_user_queries'

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
    ? factory as (client: unknown) => {
        inviteUser(email: string): Promise<unknown>
        findUserByEmail(email: string): Promise<unknown>
      }
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

  it('keeps private Auth-admin symbols out of browser, shared, repository, and normal caller-client code', () => {
    const privateAdminSymbols = [
      'supabaseServiceRoleKey',
      'serviceRoleKey',
      'createSupabaseAdminClient',
      'SupabaseAdminClient',
      'parseSupabaseAdminConfig',
    ]
    const forbiddenBrowserOrSharedFiles = [
      ...filesRecursively(resolve(root, 'app'), new Set(['.ts', '.vue'])),
      ...filesRecursively(resolve(root, 'shared'), new Set(['.ts', '.vue'])),
      ...filesRecursively(resolve(root, 'server')).filter(path => path.endsWith('.repository.ts')),
      resolve(root, 'server/utils/auth-context.ts'),
    ]
    const leaks = forbiddenBrowserOrSharedFiles.flatMap(path => {
      const source = readFileSync(path, 'utf8')
      return privateAdminSymbols
        .filter(symbol => source.includes(symbol))
        .map(symbol => `${relative(root, path).replaceAll('\\', '/')}:${symbol}`)
    })

    expect(leaks).toEqual([])
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
})
