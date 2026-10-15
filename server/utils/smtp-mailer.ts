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
