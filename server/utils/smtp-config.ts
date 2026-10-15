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

// Nitro runs NUXT_* env values through destr, so a digits-only password arrives as a number.
function password(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** Returns null when SMTP is unset; invalid partial config also falls back to manual delivery. */
export function parseSmtpConfig(raw: unknown): SmtpConfig | null {
  const source: Record<string, unknown> = typeof raw === 'object' && raw !== null ? { ...raw } : {}
  const host = text(source.host)
  const user = text(source.user)
  const pass = password(source.pass)
  const from = text(source.from)
  if (!host && !user && !pass && !from) return null
  const port = text(source.port)
  const parsed = smtpConfigSchema.safeParse({ host, user, pass, from, port: port ? Number(port) : 465 })
  if (!parsed.success) {
    // Field names only: never log values, they include credentials.
    const fields = [...new Set(parsed.error.issues.map(issue => String(issue.path[0] ?? '')).filter(Boolean))].sort()
    console.error('SMTP_CONFIG_INVALID', fields)
    return null
  }
  return parsed.data
}
