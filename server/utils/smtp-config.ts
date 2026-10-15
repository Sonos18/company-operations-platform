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
