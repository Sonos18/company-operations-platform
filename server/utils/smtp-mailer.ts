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

// Total budget for one send. nodemailer's socketTimeout is an inactivity timer and its DNS
// lookup defaults to 30 s, so without this a dead server could outlive a serverless limit.
const SEND_DEADLINE_MS = 20_000

const defaultCreateTransport: CreateSmtpTransport = options => nodemailer.createTransport(options)

function addressOf(entry: EnvelopeAddress): string {
  return (typeof entry === 'string' ? entry : entry.address).trim().toLowerCase()
}

async function withDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error('SMTP send timed out'), { code: 'ETIMEDOUT' })),
      SEND_DEADLINE_MS,
    )
  })
  try {
    return await Promise.race([operation, deadline])
  } finally {
    clearTimeout(timer)
  }
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
        dnsTimeout: 5_000,
        tls: { minVersion: 'TLSv1.2' },
      })
      const info = await withDeadline(transporter.sendMail({
        from: { name: 'Taskovia', address: config.from },
        to: message.to,
        subject: message.subject,
        text: message.text,
      }))
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
