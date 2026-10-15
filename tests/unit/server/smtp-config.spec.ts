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
    const nuxtConfig = readFileSync(resolve(import.meta.dirname, '../../..', 'nuxt.config.ts'), 'utf8').replace(/\r\n/g, '\n')
    const publicConfig = nuxtConfig.slice(nuxtConfig.indexOf('public: {'), nuxtConfig.indexOf('\n  },\n  nitro:'))
    expect(nuxtConfig).toContain("smtp: {\n      host: '',")
    expect(publicConfig).not.toContain('smtp')
  })
})
