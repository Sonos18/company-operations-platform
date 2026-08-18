import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseUserClient } from '../../../server/utils/supabase-client'

const createClient = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const root = resolve(import.meta.dirname, '../../..')
const adminSecret = 'sb_secret_that_must_not_reach_user_queries'

function filesRecursively(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory()
      ? filesRecursively(path)
      : extname(path) === '.ts' ? [path] : []
  })
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

  it('creates the private admin Auth client without persisting a browser session', async () => {
    createClient.mockReturnValue({ auth: { admin: {} } })
    const factory = await adminFactory()
    if (!factory) return

    factory({ url: 'http://127.0.0.1:54321', serviceRoleKey: adminSecret })

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

  it('resolves a retry user only through an exact normalized email across Auth API pages', async () => {
    const adapterFactory = await invitationAuthAdapter()
    if (!adapterFactory) return
    const listUsers = vi.fn()
      .mockResolvedValueOnce({
        data: {
          users: [{ id: '10000000-0000-4000-8000-000000000011', email: 'other@vqh.local' }],
          nextPage: 2,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          users: [{ id: '10000000-0000-4000-8000-000000000012', email: 'Retry@VQH.Local' }],
          nextPage: null,
        },
        error: null,
      })
    const admin = adapterFactory({ auth: { admin: { inviteUserByEmail: vi.fn(), listUsers } } })

    await expect(admin.findUserByEmail(' retry@vqh.local ')).resolves.toEqual({
      kind: 'found',
      userId: '10000000-0000-4000-8000-000000000012',
    })
    expect(listUsers).toHaveBeenNthCalledWith(1, { page: 1, perPage: 100 })
    expect(listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 100 })
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

  it('limits imports of the admin factory to invitation or offboarding dependency assembly', () => {
    const importers = filesRecursively(resolve(root, 'server'))
      .filter(path => readFileSync(path, 'utf8').includes('createSupabaseAdminClient'))
      .map(path => relative(root, path).replaceAll('\\', '/'))

    expect(importers).toEqual([
      'server/features/employees/employee.routes.ts',
      'server/utils/supabase-client.ts',
    ])
  })
})
