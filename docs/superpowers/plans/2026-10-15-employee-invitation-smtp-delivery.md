# Employee Invitation SMTP Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically send the prepared employee invitation from the company's domain SMTP mailbox, fall back to today's copy-and-send UI when SMTP is unset or fails, and delete the unused `inviteUserByEmail` flow.

**Architecture:** The existing manual preparation service is unchanged. A new delivery step (`deliverInvitation`) runs after preparation in the route. It uses an `InvitationMailer` port implemented by a nodemailer adapter, configured from server-only `runtimeConfig.smtp`. The API returns a discriminated union: `sent`, which carries no body or token, or `prepared` with `delivery: 'manual' | 'failed'`.

**Tech Stack:** Nuxt 4.3 / Nitro, TypeScript strict, zod 4, nodemailer 7.x, Vitest 4, Playwright, pnpm 10.

**Spec:** `docs/superpowers/specs/2026-10-15-employee-invitation-smtp-delivery-design.md`

## Global Constraints

- TypeScript only; no `any`. Use pnpm, never npm.
- SMTP env vars: `NUXT_SMTP_HOST`, `NUXT_SMTP_PORT`, `NUXT_SMTP_USER`, `NUXT_SMTP_PASS`, `NUXT_SMTP_FROM`. They are server-only and must never be under `runtimeConfig.public`.
- Allowed SMTP ports: `465` (implicit TLS, default) and `587` (STARTTLS, `requireTLS`). Anything else is invalid.
- Sender display name is fixed: `Taskovia`.
- Timeouts: connection `10_000` ms, greeting `10_000` ms, socket `15_000` ms; `tls.minVersion: 'TLSv1.2'`.
- Only allowed log lines: `console.error('SMTP_CONFIG_INVALID')` and `console.error('INVITATION_EMAIL_SEND_FAILED', code)`, where `code` matches `/^[A-Z][A-Z0-9_]{1,31}$/` or is `'UNKNOWN'`. Never log the message, recipient, body, token, or credentials.
- A `sent` response must never contain `body`.
- UI copy strings (Vietnamese) are verbatim from the spec's UI table.
- Endpoint URL stays `POST /api/companies/:companyId/employee-invitations/manual`.
- Commits use conventional commits and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Code style: match surrounding files (no semicolons, single quotes, 2-space indent).

## Review Focus

1. **SMTP accepts the connection but rejects the recipient** (`info.rejected` contains the recipient). HR must see the `failed` fallback, not "sent". Pinned in Task 2, mailer test "throws EENVELOPE when the recipient is rejected".
2. **SMTP host unreachable or wrong password** (`ETIMEDOUT`, `EAUTH`). The request must return the copy fallback quickly and the log must carry only the code. Pinned in Task 2, delivery test "logs only a safe error code".
3. **Half-filled env** (e.g. host set, pass missing, or `NUXT_SMTP_PORT=25`). Must fall back to manual with one `SMTP_CONFIG_INVALID` log, never crash the invite. Pinned in Task 1, config tests.
4. **Only `NUXT_SMTP_PORT=465` set (as in `.env.example`)** must count as "not configured" and must not log. Pinned in Task 1, test "port alone does not count as configured".
5. **Switching company while a send is in flight.** The UI must drop the result, as it does today. Pinned in Task 4, which keeps the existing `companyId !== activeCompanyId` guard; Task 4 e2e covers the sent state.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `shared/schemas/employee-invitations.ts` | Modify | Add `employeeInvitationResultSchema` (sent / prepared+delivery) |
| `server/utils/smtp-config.ts` | Create | Parse SMTP runtime config → `SmtpConfig \| null` |
| `nuxt.config.ts` | Modify | Server-only `runtimeConfig.smtp` |
| `.env.example` | Modify | Document `NUXT_SMTP_*` |
| `server/features/employees/invitation-delivery.ts` | Create | `InvitationMailer` port + `deliverInvitation()` |
| `server/utils/smtp-mailer.ts` | Create | nodemailer adapter + `createConfiguredInvitationMailer()` |
| `server/features/employees/manual-invitation.routes.ts` | Modify | Compose prepare → deliver |
| `app/repositories/http/http-employee-invitation-repository.ts` | Modify | Parse the new result schema |
| `app/components/employees/EmployeeInvitationForm.vue` | Modify | sent / manual / failed states |
| `tests/e2e/hr-invitations.spec.ts` | Modify | Cover the three states |
| Old automatic flow files (Task 5) | Delete/Modify | Remove `inviteUserByEmail` path |
| `docs/runbooks/*.md` | Modify | Ops + flow docs |

Task dependencies: 1 → 2 → 3 → 4; Task 5 is independent of 1–4 and can run in parallel; Task 6 runs last.

---

### Task 1: Result schema and SMTP configuration

**Files:**
- Modify: `shared/schemas/employee-invitations.ts`
- Create: `server/utils/smtp-config.ts`
- Modify: `nuxt.config.ts:18-26`
- Modify: `.env.example`
- Test: `tests/unit/shared/employee-invitation-result.spec.ts`
- Test: `tests/unit/server/smtp-config.spec.ts`

**Interfaces:**
- Produces: `employeeInvitationResultSchema`, `type EmployeeInvitationResult`, `interface SmtpConfig { host: string; port: 465 | 587; user: string; pass: string; from: string }`, `parseSmtpConfig(raw: unknown): SmtpConfig | null`, and `runtimeConfig.smtp` with `{ host, port, user, pass, from }`.

- [ ] **Step 1: Write the failing schema test**

`tests/unit/shared/employee-invitation-result.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { employeeInvitationResultSchema } from '../../../shared/schemas/employee-invitations'

const base = { recipient: 'pilot@example.test', subject: 'Lời mời tham gia Taskovia' }

describe('employee invitation result schema', () => {
  it('accepts a sent result without a body', () => {
    expect(employeeInvitationResultSchema.parse({ status: 'sent', ...base })).toEqual({ status: 'sent', ...base })
  })
  it('rejects a sent result that carries the invitation body', () => {
    expect(employeeInvitationResultSchema.safeParse({ status: 'sent', ...base, body: 'token' }).success).toBe(false)
  })
  it.each(['manual', 'failed'] as const)('accepts a prepared result with delivery %s', delivery => {
    expect(employeeInvitationResultSchema.parse({ status: 'prepared', ...base, body: 'link', delivery }).status).toBe('prepared')
  })
  it('rejects a prepared result without a delivery reason', () => {
    expect(employeeInvitationResultSchema.safeParse({ status: 'prepared', ...base, body: 'link' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Write the failing config test**

`tests/unit/server/smtp-config.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSmtpConfig } from '../../../server/utils/smtp-config'

const valid = { host: 'smtp.zoho.com', port: '', user: 'noreply@vqh.test', pass: 'app-password-value', from: 'NoReply@vqh.test' }

describe('SMTP configuration', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returns null without logging when SMTP is not configured', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(parseSmtpConfig({ host: '', port: '', user: '', pass: '', from: '' })).toBeNull()
    expect(parseSmtpConfig(undefined)).toBeNull()
    expect(log).not.toHaveBeenCalled()
  })

  it('port alone does not count as configured', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(parseSmtpConfig({ host: '', port: 465, user: '', pass: '', from: '' })).toBeNull()
    expect(log).not.toHaveBeenCalled()
  })

  it('defaults to implicit TLS port 465 and normalizes the sender', () => {
    expect(parseSmtpConfig(valid)).toEqual({ ...valid, port: 465, from: 'noreply@vqh.test' })
  })

  it.each([587, '587'])('accepts STARTTLS port %s', port => {
    expect(parseSmtpConfig({ ...valid, port })?.port).toBe(587)
  })

  it.each([
    { ...valid, port: 25 },
    { ...valid, pass: '' },
    { ...valid, from: 'not-an-email' },
    { ...valid, host: 'smtp zoho.com' },
    { ...valid, user: '' },
  ])('fails closed to manual delivery for invalid config %#', raw => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(parseSmtpConfig(raw)).toBeNull()
    expect(log.mock.calls).toEqual([['SMTP_CONFIG_INVALID']])
  })

  it('keeps SMTP credentials outside the public runtime configuration', () => {
    const nuxtConfig = readFileSync(resolve(import.meta.dirname, '../../..', 'nuxt.config.ts'), 'utf8')
    const publicConfig = nuxtConfig.slice(nuxtConfig.indexOf('public: {'), nuxtConfig.indexOf('\n  },\n  nitro:'))
    expect(nuxtConfig).toContain("smtp: {\n      host: '',")
    expect(publicConfig).not.toContain('smtp')
  })
})
```

- [ ] **Step 3: Run both tests and confirm they fail**

Run: `pnpm vitest run tests/unit/shared/employee-invitation-result.spec.ts tests/unit/server/smtp-config.spec.ts`
Expected: FAIL. `employeeInvitationResultSchema` is undefined and `server/utils/smtp-config` cannot be resolved.

- [ ] **Step 4: Add the result schema**

Append to `shared/schemas/employee-invitations.ts`:

```ts
export const sentEmployeeInvitationSchema = z.object({
  status: z.literal('sent'),
  recipient: z.string().email(),
  subject: z.string().min(1),
}).strict()
export const manualEmployeeInvitationSchema = preparedEmployeeInvitationSchema.extend({
  delivery: z.enum(['manual', 'failed']),
}).strict()
export const employeeInvitationResultSchema = z.discriminatedUnion('status', [
  sentEmployeeInvitationSchema,
  manualEmployeeInvitationSchema,
])
export type EmployeeInvitationResult = z.infer<typeof employeeInvitationResultSchema>
```

- [ ] **Step 5: Create `server/utils/smtp-config.ts`**

```ts
import { z } from 'zod'

export interface SmtpConfig {
  host: string
  port: 465 | 587
  user: string
  pass: string
  from: string
}

const smtpConfigSchema = z.object({
  host: z.string().min(1).regex(/^[A-Za-z0-9.-]+$/),
  port: z.union([z.literal(465), z.literal(587)]),
  user: z.string().min(1),
  pass: z.string().min(1),
  from: z.string().toLowerCase().email(),
}).strict()

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

/** Returns null when SMTP is unset; invalid partial config also falls back to manual delivery. */
export function parseSmtpConfig(raw: unknown): SmtpConfig | null {
  const source: Record<string, unknown> = typeof raw === 'object' && raw !== null ? { ...raw } : {}
  const host = text(source.host)
  const user = text(source.user)
  const pass = typeof source.pass === 'string' ? source.pass : ''
  const from = text(source.from)
  if (!host && !user && !pass && !from) return null
  const port = text(source.port)
  const parsed = smtpConfigSchema.safeParse({ host, user, pass, from, port: port ? Number(port) : 465 })
  if (!parsed.success) {
    console.error('SMTP_CONFIG_INVALID')
    return null
  }
  return parsed.data
}
```

- [ ] **Step 6: Add server-only runtime config**

In `nuxt.config.ts`, insert `smtp` **before** `public:`:

```ts
  runtimeConfig: {
    materialQuotationOpenaiApiKey: '',
    supabaseServiceRoleKey: '',
    smtp: {
      host: '',
      port: '',
      user: '',
      pass: '',
      from: '',
    },
    public: {
```

The secrecy test slices from `public: {` to `\n  },\n  nitro:`. Confirm `nitro:` directly follows the `runtimeConfig` block, as it does today.

- [ ] **Step 7: Document env vars**

Append to `.env.example`:

```
# Domain mailbox that sends employee invitations. Server only; never NUXT_PUBLIC_.
# Leave host/user/pass/from empty to keep the manual copy-and-send flow.
# Zoho: smtp.zoho.com (smtppro.zoho.com for org mailboxes); Hostinger: smtp.hostinger.com; cPanel: mail.<domain>
NUXT_SMTP_HOST=
NUXT_SMTP_PORT=465
NUXT_SMTP_USER=
NUXT_SMTP_PASS=
NUXT_SMTP_FROM=
```

- [ ] **Step 8: Run tests and confirm they pass**

Run: `pnpm vitest run tests/unit/shared/employee-invitation-result.spec.ts tests/unit/server/smtp-config.spec.ts tests/unit/config/supabase-environment.spec.ts tests/unit/server/supabase-config.spec.ts`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add shared/schemas/employee-invitations.ts server/utils/smtp-config.ts nuxt.config.ts .env.example tests/unit/shared/employee-invitation-result.spec.ts tests/unit/server/smtp-config.spec.ts
git commit -m "feat(employees): add invitation result schema and server-only SMTP config"
```

---

### Task 2: Delivery step and nodemailer adapter

**Files:**
- Create: `server/features/employees/invitation-delivery.ts`
- Create: `server/utils/smtp-mailer.ts`
- Modify: `package.json`, `pnpm-lock.yaml` (via pnpm)
- Test: `tests/unit/server/invitation-delivery.spec.ts`
- Test: `tests/unit/server/smtp-mailer.spec.ts`

**Interfaces:**
- Consumes: `PreparedEmployeeInvitation`, `EmployeeInvitationResult` (shared schema), `SmtpConfig`, `parseSmtpConfig` (Task 1).
- Produces:
  - `interface InvitationEmail { to: string; subject: string; text: string }`
  - `interface InvitationMailer { send(message: InvitationEmail): Promise<void> }`
  - `deliverInvitation(draft: PreparedEmployeeInvitation, mailer: InvitationMailer | null): Promise<EmployeeInvitationResult>`
  - `createSmtpInvitationMailer(config: SmtpConfig, createTransport?: CreateSmtpTransport): InvitationMailer`
  - `createConfiguredInvitationMailer(raw: unknown): InvitationMailer | null`

- [ ] **Step 1: Install nodemailer**

Run: `pnpm add nodemailer@^7 && pnpm add -D @types/nodemailer`
Expected: both appear in `package.json`; the lockfile is updated.

- [ ] **Step 2: Write the failing delivery test**

`tests/unit/server/invitation-delivery.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deliverInvitation } from '../../../server/features/employees/invitation-delivery'
import { employeeInvitationResultSchema } from '../../../shared/schemas/employee-invitations'

const draft = {
  status: 'prepared' as const,
  recipient: 'pilot@example.test',
  subject: 'Lời mời tham gia Taskovia',
  body: 'Mở link: https://pilot.taskovia.test/auth/callback?token_hash=synthetic-token&type=invite',
}

describe('invitation delivery', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returns the manual copy flow when no mailer is configured', async () => {
    await expect(deliverInvitation(draft, null)).resolves.toEqual({ ...draft, delivery: 'manual' })
  })

  it('sends the exact prepared email and withholds the body once accepted', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const result = await deliverInvitation(draft, { send })
    expect(send).toHaveBeenCalledWith({ to: draft.recipient, subject: draft.subject, text: draft.body })
    expect(result).toEqual({ status: 'sent', recipient: draft.recipient, subject: draft.subject })
    expect(result).not.toHaveProperty('body')
    expect(employeeInvitationResultSchema.parse(result)).toEqual(result)
  })

  it('falls back to manual copy when sending fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('Invalid login'), { code: 'EAUTH' }))
    await expect(deliverInvitation(draft, { send })).resolves.toEqual({ ...draft, delivery: 'failed' })
  })

  it.each([
    [Object.assign(new Error('535 auth failed for app-password-value'), { code: 'EAUTH' }), 'EAUTH'],
    [Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), 'ETIMEDOUT'],
    [Object.assign(new Error('x'), { code: 'pilot@example.test synthetic-token' }), 'UNKNOWN'],
    [new Error('plain'), 'UNKNOWN'],
    ['string failure', 'UNKNOWN'],
  ])('logs only a safe error code %#', async (error, code) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await deliverInvitation(draft, { send: vi.fn().mockRejectedValue(error) })
    expect(log.mock.calls).toEqual([['INVITATION_EMAIL_SEND_FAILED', code]])
  })
})
```

- [ ] **Step 3: Write the failing mailer test**

`tests/unit/server/smtp-mailer.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createConfiguredInvitationMailer, createSmtpInvitationMailer } from '../../../server/utils/smtp-mailer'
import type { SmtpConfig } from '../../../server/utils/smtp-config'

const config: SmtpConfig = { host: 'smtp.zoho.com', port: 465, user: 'noreply@vqh.test', pass: 'app-password-value', from: 'noreply@vqh.test' }
const message = { to: 'pilot@example.test', subject: 'Lời mời tham gia Taskovia', text: 'body' }

function transport(info: { accepted: unknown[], rejected: unknown[] }) {
  const sendMail = vi.fn().mockResolvedValue(info)
  const createTransport = vi.fn().mockReturnValue({ sendMail })
  return { sendMail, createTransport }
}

describe('SMTP invitation mailer', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('uses implicit TLS with bounded timeouts on port 465', async () => {
    const { sendMail, createTransport } = transport({ accepted: ['pilot@example.test'], rejected: [] })
    await createSmtpInvitationMailer(config, createTransport).send(message)
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.zoho.com', port: 465, secure: true, requireTLS: false,
      auth: { user: 'noreply@vqh.test', pass: 'app-password-value' },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
      tls: { minVersion: 'TLSv1.2' },
    })
    expect(sendMail).toHaveBeenCalledWith({
      from: { name: 'Taskovia', address: 'noreply@vqh.test' },
      to: 'pilot@example.test', subject: message.subject, text: 'body',
    })
  })

  it('requires STARTTLS on port 587', async () => {
    const { createTransport } = transport({ accepted: ['pilot@example.test'], rejected: [] })
    await createSmtpInvitationMailer({ ...config, port: 587 }, createTransport).send(message)
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false, requireTLS: true }))
  })

  it('accepts address objects in the SMTP envelope result', async () => {
    const { createTransport } = transport({ accepted: [{ name: '', address: 'Pilot@Example.test' }], rejected: [] })
    await expect(createSmtpInvitationMailer(config, createTransport).send(message)).resolves.toBeUndefined()
  })

  it('throws EENVELOPE when the recipient is rejected', async () => {
    const { createTransport } = transport({ accepted: [], rejected: ['pilot@example.test'] })
    await expect(createSmtpInvitationMailer(config, createTransport).send(message)).rejects.toMatchObject({ code: 'EENVELOPE' })
  })

  it('propagates transport failures', async () => {
    const sendMail = vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
    const createTransport = vi.fn().mockReturnValue({ sendMail })
    await expect(createSmtpInvitationMailer(config, createTransport).send(message)).rejects.toMatchObject({ code: 'ETIMEDOUT' })
  })

  it('builds no mailer when SMTP is unset', () => {
    expect(createConfiguredInvitationMailer({ host: '', port: '', user: '', pass: '', from: '' })).toBeNull()
  })

  it('builds a mailer from valid runtime config', () => {
    expect(createConfiguredInvitationMailer({ ...config, port: '465' })).toEqual({ send: expect.any(Function) })
  })
})
```

- [ ] **Step 4: Run both tests and confirm they fail**

Run: `pnpm vitest run tests/unit/server/invitation-delivery.spec.ts tests/unit/server/smtp-mailer.spec.ts`
Expected: FAIL with module-not-found errors.

- [ ] **Step 5: Create `server/features/employees/invitation-delivery.ts`**

```ts
import type {
  EmployeeInvitationResult,
  PreparedEmployeeInvitation,
} from '../../../shared/schemas/employee-invitations'

export interface InvitationEmail {
  to: string
  subject: string
  text: string
}

export interface InvitationMailer {
  send(message: InvitationEmail): Promise<void>
}

const safeErrorCode = /^[A-Z][A-Z0-9_]{1,31}$/

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error
    if (typeof code === 'string' && safeErrorCode.test(code)) return code
  }
  return 'UNKNOWN'
}

/** Sends a prepared invitation; on any failure HR keeps the manual copy flow. */
export async function deliverInvitation(
  draft: PreparedEmployeeInvitation,
  mailer: InvitationMailer | null,
): Promise<EmployeeInvitationResult> {
  if (!mailer) return { ...draft, delivery: 'manual' }
  try {
    await mailer.send({ to: draft.recipient, subject: draft.subject, text: draft.body })
  } catch (error) {
    // Provider messages may echo credentials or addresses; log the code only.
    console.error('INVITATION_EMAIL_SEND_FAILED', errorCode(error))
    return { ...draft, delivery: 'failed' }
  }
  return { status: 'sent', recipient: draft.recipient, subject: draft.subject }
}
```

- [ ] **Step 6: Create `server/utils/smtp-mailer.ts`**

```ts
import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import type { InvitationMailer } from '../features/employees/invitation-delivery'
import { parseSmtpConfig } from './smtp-config'
import type { SmtpConfig } from './smtp-config'

type EnvelopeAddress = string | { address: string }

interface SmtpTransport {
  sendMail(options: {
    from: { name: string, address: string }
    to: string
    subject: string
    text: string
  }): Promise<{ accepted: EnvelopeAddress[], rejected: EnvelopeAddress[] }>
}

export type CreateSmtpTransport = (options: SMTPTransport.Options) => SmtpTransport

const defaultCreateTransport: CreateSmtpTransport = options => nodemailer.createTransport(options)

function addressOf(entry: EnvelopeAddress): string {
  return (typeof entry === 'string' ? entry : entry.address).trim().toLowerCase()
}

export function createSmtpInvitationMailer(
  config: SmtpConfig,
  createTransport: CreateSmtpTransport = defaultCreateTransport,
): InvitationMailer {
  return {
    async send(message) {
      // One transporter per request: serverless instances must not hold SMTP pools.
      const transporter = createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        requireTLS: config.port === 587,
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        tls: { minVersion: 'TLSv1.2' },
      })
      const info = await transporter.sendMail({
        from: { name: 'Taskovia', address: config.from },
        to: message.to,
        subject: message.subject,
        text: message.text,
      })
      const recipient = message.to.trim().toLowerCase()
      if (!info.accepted.map(addressOf).includes(recipient) || info.rejected.map(addressOf).includes(recipient)) {
        throw Object.assign(new Error('SMTP recipient not accepted'), { code: 'EENVELOPE' })
      }
    },
  }
}

export function createConfiguredInvitationMailer(raw: unknown): InvitationMailer | null {
  const config = parseSmtpConfig(raw)
  return config ? createSmtpInvitationMailer(config) : null
}
```

If `nodemailer.createTransport(options)` does not satisfy `SmtpTransport` under `@types/nodemailer` (its `accepted` type is `Array<string | Mail.Address>`, which is compatible), keep the narrow `SmtpTransport` interface and adjust only `defaultCreateTransport`. Do not widen to `any`.

- [ ] **Step 7: Run tests and confirm they pass**

Run: `pnpm vitest run tests/unit/server/invitation-delivery.spec.ts tests/unit/server/smtp-mailer.spec.ts`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml server/features/employees/invitation-delivery.ts server/utils/smtp-mailer.ts tests/unit/server/invitation-delivery.spec.ts tests/unit/server/smtp-mailer.spec.ts
git commit -m "feat(employees): send prepared invitations through domain SMTP"
```

---

### Task 3: Wire delivery into the invitation route and client repository

**Files:**
- Modify: `server/features/employees/manual-invitation.routes.ts` (the `prepare` function inside `createSupabaseManualInvitationRoutes`)
- Modify: `app/repositories/http/http-employee-invitation-repository.ts`
- Test: `tests/unit/server/manual-invitation-routes.spec.ts`

**Interfaces:**
- Consumes: `deliverInvitation` and `createConfiguredInvitationMailer` (Task 2), `employeeInvitationResultSchema` (Task 1).
- Produces: `POST …/employee-invitations/manual` responds with `EmployeeInvitationResult`; `$employeeInvitations.prepare(input)` resolves to `EmployeeInvitationResult`.

- [ ] **Step 1: Write the failing route test**

Append inside the `describe('manual invitation routes', …)` block in `tests/unit/server/manual-invitation-routes.spec.ts`:

```ts
 it('returns the delivered result unchanged and still sets no-store', async () => {
  readBody.mockResolvedValue({ employeeCode: 'P1', fullName: 'Pilot', workEmail: 'pilot@example.test', departmentId: context.actorId })
  const sent = { status: 'sent', recipient: 'pilot@example.test', subject: 'Lời mời tham gia Taskovia' }
  const routes = createManualInvitationRoutes({ resolveContext: vi.fn().mockResolvedValue(context), prepare: vi.fn().mockResolvedValue(sent), options: vi.fn(), takeSlot: vi.fn() })
  await expect(routes.prepare({} as never)).resolves.toEqual(sent)
  expect(setResponseHeader).toHaveBeenCalledWith(expect.anything(), 'Cache-Control', 'no-store')
 })
 it('composes preparation with SMTP delivery in the Supabase assembly', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const source = readFileSync(resolve(import.meta.dirname, '../../../server/features/employees/manual-invitation.routes.ts'), 'utf8')
  expect(source).toContain('deliverInvitation(draft, createConfiguredInvitationMailer(runtime.smtp))')
 })
```

- [ ] **Step 2: Run the test and confirm the composition assertion fails**

Run: `pnpm vitest run tests/unit/server/manual-invitation-routes.spec.ts`
Expected: the first new test PASSES (the route already passes results through) and the second FAILS (the composition is missing).

- [ ] **Step 3: Compose delivery in the route**

In `server/features/employees/manual-invitation.routes.ts`, add imports:

```ts
import { createConfiguredInvitationMailer } from '../../utils/smtp-mailer'
import { deliverInvitation } from './invitation-delivery'
```

Replace the last line of the `prepare` dependency:

```ts
      return createManualEmployeeInvitationService(repository, auth, runtime.public.appUrl).prepare(context, input)
```

with:

```ts
      const draft = await createManualEmployeeInvitationService(repository, auth, runtime.public.appUrl).prepare(context, input)
      return deliverInvitation(draft, createConfiguredInvitationMailer(runtime.smtp))
```

- [ ] **Step 4: Parse the new result on the client**

In `app/repositories/http/http-employee-invitation-repository.ts`, replace `preparedEmployeeInvitationSchema` with `employeeInvitationResultSchema` in both the import and `schema:`:

```ts
import { employeeInvitationOptionsSchema, employeeInvitationResultSchema } from '../../../shared/schemas/employee-invitations'
```
```ts
      url: base() + '/manual', method: 'POST', body: employeeInvitationInputSchema.parse(input), schema: employeeInvitationResultSchema,
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm vitest run tests/unit/server/manual-invitation-routes.spec.ts tests/unit/server/manual-employee-invitation.spec.ts && pnpm typecheck`
Expected: tests PASS. Typecheck reports errors **only** in `EmployeeInvitationForm.vue`, because `PreparedEmployeeInvitation` is now narrower than the result. Task 4 fixes them. If any other file errors, fix it here.

- [ ] **Step 6: Commit**

```bash
git add server/features/employees/manual-invitation.routes.ts app/repositories/http/http-employee-invitation-repository.ts tests/unit/server/manual-invitation-routes.spec.ts
git commit -m "feat(employees): deliver invitations after preparation"
```

---

### Task 4: Invitation form states (UI)

Per the global orchestration rules, delegate this task to `ui-agy`. The script logic and copy below are exact; agy may adjust only the styling classes. Opus reviews the result with the `frontend-design` skill, and `verifier` runs Playwright.

**Files:**
- Modify: `app/components/employees/EmployeeInvitationForm.vue`
- Test: `tests/e2e/hr-invitations.spec.ts`

**Interfaces:**
- Consumes: `EmployeeInvitationResult` (Task 1) and `$employeeInvitations.prepare()` (Task 3).
- Produces: the same component events as today: `close`, `prepared`.

- [ ] **Step 1: Update the e2e tests first (they will fail)**

In `tests/e2e/hr-invitations.spec.ts`:

1. In the existing test, change the mocked response body to include `delivery: 'manual'`, and rename the click target `'Chuẩn bị lời mời'` → `'Gửi lời mời'`. Rename the test to `'HR copies a prepared invitation when SMTP is not configured'`.
2. Add two tests after it:

```ts
test('HR sees a sent invitation without the link reaching the browser', async ({ page }) => {
 await page.route('**/employee-invitations/manual', route => route.fulfill({ contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ status: 'sent', recipient: 'pilot@example.test', subject: 'Lời mời tham gia Taskovia' }) }))
 await page.goto('/employees')
 await page.getByRole('button', { name: 'Mời nhân viên', exact: true }).click()
 await page.getByLabel('Mã nhân viên', { exact: true }).fill('PILOT-1')
 await page.getByLabel('Họ và tên', { exact: true }).fill('Pilot User')
 await page.getByLabel('Email nhận lời mời').fill('pilot@example.test')
 await page.getByLabel('Phòng ban nhân viên').selectOption(departmentId)
 await page.getByRole('button', { name: 'Gửi lời mời', exact: true }).click()
 await expect(page.getByText('Đã gửi email mời · Máy chủ email đã nhận', { exact: true })).toBeVisible()
 await expect(page.getByLabel('Người nhận', { exact: true })).toHaveValue('pilot@example.test')
 await expect(page.getByLabel('Nội dung email', { exact: true })).toHaveCount(0)
 await expect(page.getByRole('button', { name: 'Sao chép lời mời', exact: true })).toHaveCount(0)
})
test('HR falls back to copying when automatic sending fails', async ({ page }) => {
 await page.route('**/employee-invitations/manual', route => route.fulfill({ contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ status: 'prepared', delivery: 'failed', recipient: 'pilot@example.test', subject: 'Lời mời tham gia Taskovia', body: 'Mở link riêng: https://pilot.taskovia.test/auth/callback?token_hash=' + token + '&type=invite' }) }))
 await page.goto('/employees')
 await page.getByRole('button', { name: 'Mời nhân viên', exact: true }).click()
 await page.getByLabel('Mã nhân viên', { exact: true }).fill('PILOT-1')
 await page.getByLabel('Họ và tên', { exact: true }).fill('Pilot User')
 await page.getByLabel('Email nhận lời mời').fill('pilot@example.test')
 await page.getByLabel('Phòng ban nhân viên').selectOption(departmentId)
 await page.getByRole('button', { name: 'Gửi lời mời', exact: true }).click()
 await expect(page.getByRole('alert')).toHaveText('Không gửi được email tự động. Hãy sao chép và gửi thủ công cho đúng người nhận.')
 await expect(page.getByText('Đã chuẩn bị · Chưa xác nhận gửi', { exact: true })).toBeVisible()
 await expect(page.getByRole('button', { name: 'Sao chép lời mời', exact: true })).toBeVisible()
})
```

Run: `pnpm exec playwright test tests/e2e/hr-invitations.spec.ts`
Expected: FAIL, because the button is still labelled "Chuẩn bị lời mời".

- [ ] **Step 2: Update the script**

In `EmployeeInvitationForm.vue` `<script setup>`:

- Replace the type import with `import type { EmployeeInvitationResult } from '../../../shared/schemas/employee-invitations'`.
- Replace `const prepared = ref<PreparedEmployeeInvitation | null>(null)` with:

```ts
const result = ref<EmployeeInvitationResult | null>(null)
const manual = computed(() => (result.value?.status === 'prepared' ? result.value : null))
```

- Rename every other `prepared.value` to `result.value` (in `close`, `onBeforeUnmount`, and `submit`, where it is reset and assigned).
- In `copyInvitation`, use `manual.value` in place of `prepared.value`:

```ts
async function copyInvitation() {
  const invitation = manual.value
  if (!invitation) return
  copyMessage.value = ''
  try {
    await navigator.clipboard.writeText('Đến: ' + invitation.recipient + '\nTiêu đề: ' + invitation.subject + '\n\n' + invitation.body)
    if (!disposed) copyMessage.value = 'Đã sao chép. Hãy dán vào ứng dụng email và gửi riêng đúng người nhận.'
  } catch { if (!disposed) copyMessage.value = 'Trình duyệt không cho sao chép. Bạn có thể chọn và sao chép nội dung email bên dưới.' }
}
```

Keep `emit('prepared')` after a successful result; the page uses it to refresh the directory.

- [ ] **Step 3: Update the template**

- Help paragraph (line 70) → `Taskovia gửi email mời từ địa chỉ email của công ty. Nếu chưa gửi được, bạn có thể sao chép và gửi thủ công.`
- `<form v-if="!prepared"` → `<form v-if="!result"`
- Submit button text `Chuẩn bị lời mời` → `Gửi lời mời`
- Replace the whole `<div v-else class="invitation-result">…</div>` with:

```vue
    <div v-else-if="result.status === 'sent'" class="invitation-result">
      <p class="invitation-status" role="status">Đã gửi email mời · Máy chủ email đã nhận</p>
      <label>Người nhận<input :value="result.recipient" readonly></label>
      <label>Tiêu đề email<input :value="result.subject" readonly></label>
      <p class="invitation-help">Nếu người nhận không thấy email, hãy nhờ họ kiểm tra thư mục Spam. Tạo lại lời mời sẽ cấp link mới.</p>
    </div>
    <div v-else-if="manual" class="invitation-result">
      <p v-if="manual.delivery === 'failed'" class="invitation-error" role="alert">Không gửi được email tự động. Hãy sao chép và gửi thủ công cho đúng người nhận.</p>
      <p class="invitation-status" role="status">Đã chuẩn bị · Chưa xác nhận gửi</p>
      <label>Người nhận<input :value="manual.recipient" readonly></label>
      <label>Tiêu đề email<input :value="manual.subject" readonly></label>
      <label>Nội dung email<textarea :value="manual.body" readonly rows="10" spellcheck="false" /></label>
      <p class="invitation-help">Link trong email chỉ dành cho người nhận và dùng một lần. Không gửi vào nhóm hoặc chuyển tiếp cho người khác. Đóng khung này sẽ xóa lời mời khỏi màn hình.</p>
      <UButton color="primary" @click="copyInvitation">Sao chép lời mời</UButton>
      <p v-if="copyMessage" role="status">{{ copyMessage }}</p>
    </div>
```

The top-level `<p v-if="error" … role="alert">` and the failed alert never show together, because `error` is cleared on submit. The e2e `getByRole('alert')` therefore matches exactly one element.

- [ ] **Step 4: Run e2e and typecheck**

Run: `pnpm exec playwright test tests/e2e/hr-invitations.spec.ts && pnpm typecheck`
Expected: 4 tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add app/components/employees/EmployeeInvitationForm.vue tests/e2e/hr-invitations.spec.ts
git commit -m "feat(employees): show sent, manual and failed invitation states"
```

---

### Task 5: Remove the unused `inviteUserByEmail` flow

Independent of Tasks 1–4; it can run in a parallel worktree.

**Files:**
- Delete: `server/api/companies/[companyId]/employee-invitations.post.ts`
- Modify: `server/features/employees/employee.routes.ts`
- Modify: `server/features/employees/employee.service.ts`
- Modify: `server/features/employees/employee-invitation-auth.ts`
- Modify: `server/utils/supabase-client.ts`
- Modify: `tests/unit/server/employee-routes.spec.ts`, `tests/unit/server/employee.service.spec.ts`, `tests/unit/server/service-role-boundary.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EmployeeRouteService` without `authorizeInvitation`/`invite`; `createEmployeeService` without them; `SupabaseAdminClient['auth']['admin']` picks `'listUsers' | 'updateUserById' | 'generateLink' | 'getUserById' | 'createUser'`; `employee-invitation-auth.ts` exports only `EmployeeOffboardingAuthResult` and `EmployeeOffboardingAuthAdmin`.

- [ ] **Step 1: Add a regression test that the route is gone**

Append to `tests/unit/server/service-role-boundary.spec.ts` (inside its top-level `describe`):

```ts
  it('has no automatic inviteUserByEmail invitation path', () => {
    expect(existsSync(resolve(root, 'server/api/companies/[companyId]/employee-invitations.post.ts'))).toBe(false)
    const serverSources = filesRecursively(resolve(root, 'server')).map(path => readFileSync(path, 'utf8'))
    expect(serverSources.some(source => source.includes('inviteUserByEmail'))).toBe(false)
  })
```

Add `existsSync` to the file's existing `node:fs` import. Run: `pnpm vitest run tests/unit/server/service-role-boundary.spec.ts -t "inviteUserByEmail"`. Expected: FAIL.

- [ ] **Step 2: Delete the route file**

```bash
git rm "server/api/companies/[companyId]/employee-invitations.post.ts"
```

- [ ] **Step 3: Strip `employee.routes.ts`**

- Remove the imports `employeeInvitationInputSchema`, `buildAuthCallbackUrl`, and `createSupabaseInvitationAuthAdmin`.
- Remove `authorizeInvitation` and `invite` from `EmployeeRouteService`.
- Remove the `async invite(event)` handler from `createEmployeeRoutes`.
- Remove the `invitationAuthAdmin()` function and the `authorizeInvitation:` / `invite:` entries in `createSupabaseEmployeeRoutes`.

- [ ] **Step 4: Strip `employee.service.ts`**

Remove `authorizeInvitation`, `invite`, and the helpers used only by them: `accountInviteFailed`, `onboardingIncomplete`, `normalizeInvitation`, `validatedOnboardingResult`. Remove the now-unused imports `EmployeeInvitationInput`, `employeeDetailSchema`, and `EmployeeInvitationAuthAdmin`. Keep everything offboarding/list/detail/update uses. Run `pnpm lint server/features/employees` to catch unused symbols.

- [ ] **Step 5: Strip `employee-invitation-auth.ts`**

Delete `EmployeeInvitationAuthResult`, `EmployeeInvitationUserLookup`, and `EmployeeInvitationAuthAdmin`. Keep:

```ts
export type EmployeeOffboardingAuthResult =
  | { kind: 'disabled' }
  | { kind: 'failed' }

export interface EmployeeOffboardingAuthAdmin {
  disableUser(userId: string): Promise<EmployeeOffboardingAuthResult>
}
```

- [ ] **Step 6: Strip `server/utils/supabase-client.ts`**

- Change the `Pick` to `'listUsers' | 'updateUserById' | 'generateLink' | 'getUserById' | 'createUser'`.
- Remove `EmployeeInvitationAuthAdmin` from the type import.
- Delete `createSupabaseInvitationAuthAdmin` and the helpers only it used: `duplicateInviteErrorSchema`, `authUserSchema`, `paginationSchema`, `authUserPageLimit`, `authUserPageSize`, `normalizeEmail`, `isDocumentedDuplicateInviteError`.
- Keep `authUserIdSchema` and `disabledAccountBanDuration`; offboarding uses them.

- [ ] **Step 7: Remove obsolete tests**

- `tests/unit/server/employee-routes.spec.ts`: delete the three tests starting at "accepts only the invitation schema…", "rejects client-supplied invitation actor…", and "denies an unauthorized invitation…".
- `tests/unit/server/employee.service.spec.ts`: delete these seven tests: "invites a normalized work email then completes onboarding…", "reuses the exact normalized existing Auth user…", "returns the schema-valid redacted summary when onboarding permissions…", "fails safely when a documented existing-user response…", "redacts Auth provider details and maps Auth failures to ACCOUNT_INVITE_FAILED", "preserves a stable incomplete-onboarding error after Auth succeeds", and "does not initialize Auth administration when either invitation permission is absent". Also delete the whole `describe('legacy contact onboarding boundary', …)`. Afterwards `grep -n "invite(" tests/unit/server/employee.service.spec.ts` must print nothing. Then delete fixtures that become unused (likely `invitedEmployee`); lint will flag them.
- `tests/unit/server/service-role-boundary.spec.ts`: delete the `invitationAuthAdapter()` helper and every test that calls it ("resolves one exact normalized retry user…" through "fails closed for a repeating Auth page cycle" and any others using `adapterFactory` from it). Keep the offboarding adapter tests.

- [ ] **Step 8: Run the affected suites, lint, and typecheck**

Run: `pnpm vitest run tests/unit/server && pnpm lint && pnpm typecheck`
Expected: all PASS, including the new "has no automatic inviteUserByEmail invitation path" test. `manual-employee-invitation.spec.ts` still passes; its mock may keep an extra `inviteUserByEmail: vi.fn()` and still asserts it is never called.

- [ ] **Step 9: Commit**

```bash
git add -A server tests/unit/server
git commit -m "refactor(employees): remove unused inviteUserByEmail invitation flow"
```

---

### Task 6: Documentation and full verification

**Files:**
- Modify: `docs/runbooks/hr-manual-invitations.md`
- Modify: `docs/runbooks/auth-flow.md:20-31`
- Modify: `docs/runbooks/employee-onboarding-and-rbac.md:39`

- [ ] **Step 1: Update `hr-manual-invitations.md`**

- Rename the title to `# HR employee invitations (SMTP delivery with manual fallback)`.
- Replace the first paragraph with: "HR submits the invitation form. Taskovia prepares a one-time invite link and, when `NUXT_SMTP_*` is configured, sends it from the company domain mailbox. If SMTP is unset (`delivery: manual`) or sending fails (`delivery: failed`), HR copies the prepared email and sends it privately. `sent` means the SMTP server accepted the message, not that it was delivered."
- Replace the bullet "`POST …/manual` prepares the invitation. The original automatic email API remains separate." with: "`POST /api/companies/:companyId/employee-invitations/manual` prepares the invitation, then delivers it through SMTP. A `sent` response omits the body, so the token never reaches the browser. The former `inviteUserByEmail` endpoint has been removed."
- Add a section `## SMTP delivery setup (owner)` containing the four "Owner operations" steps from the spec, verbatim, plus the env-var table.
- In "Sensitive handoff", add: "Server logs contain only `SMTP_CONFIG_INVALID` or `INVITATION_EMAIL_SEND_FAILED <code>`; never addresses, bodies, or credentials."

- [ ] **Step 2: Update `auth-flow.md` "Invite and first password"**

Replace steps 1–2 with:

```
1. An authorized employee administrator submits the HR invitation form (`POST /api/companies/:companyId/employee-invitations/manual`). Do not create or transmit a password for the invitee.
2. The server creates the owned pending identity, generates an invite `hashed_token` with `generateLink(type: invite)`, and builds the callback link from the configured app origin. It sends the email through the domain SMTP mailbox, or returns it for manual sending; see [HR employee invitations](hr-manual-invitations.md).
```

Change line 20 to drop "The automatic email flow below remains separate." Keep steps 3–6. Step 3 still applies to Supabase-sent recovery emails once Auth custom SMTP is configured.

- [ ] **Step 3: Update `employee-onboarding-and-rbac.md:39`**

Change `POST /api/companies/:companyId/employee-invitations` to `POST /api/companies/:companyId/employee-invitations/manual`.

- [ ] **Step 4: Run full verification**

Run: `pnpm verify:app`
Expected: unit, typecheck, lint, and build all PASS.

Run: `pnpm exec playwright test tests/e2e/hr-invitations.spec.ts`
Expected: 4 PASS.

- [ ] **Step 5: Refresh the knowledge graph**

Run: `graphify update .`

- [ ] **Step 6: Commit**

```bash
git add docs/runbooks
git commit -m "docs(employees): document SMTP invitation delivery and fallback"
```

- [ ] **Step 7: Manual smoke (owner, after env is set)**

With real `NUXT_SMTP_*` in `.env.local`, run `pnpm dev`. Invite an approved test address and confirm all of the following:
1. The UI shows "Đã gửi email mời · Máy chủ email đã nhận".
2. The email arrives in the inbox, not Spam, from `Taskovia <noreply@domain>`.
3. The link opens `/auth/callback` and leads to setting a password.
4. A wrong `NUXT_SMTP_PASS` produces the failed fallback, and the server log shows `INVITATION_EMAIL_SEND_FAILED EAUTH`.
