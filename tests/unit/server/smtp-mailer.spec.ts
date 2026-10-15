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
