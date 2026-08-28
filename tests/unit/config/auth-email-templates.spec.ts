import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')

function authConfig(): Record<string, Record<string, unknown>> {
  const sections: Record<string, Record<string, unknown>> = {}
  let section = ''

  for (const rawLine of readFileSync(resolve(root, 'supabase/config.toml'), 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const header = line.match(/^\[([^\]]+)\]$/)
    if (header) {
      section = header[1]!
      sections[section] ??= {}
      continue
    }

    const assignment = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/)
    if (!assignment || !section) continue
    sections[section]![assignment[1]!] = JSON.parse(assignment[2]!)
  }

  return sections
}

function emailTemplate(name: 'invite' | 'recovery'): string {
  return readFileSync(resolve(root, `supabase/templates/${name}.html`), 'utf8')
}

describe('Taskovia Auth email configuration', () => {
  it('disables public signup and permits only the canonical local callback redirect', () => {
    const config = authConfig()

    expect(config.auth).toMatchObject({
      site_url: 'http://127.0.0.1:3000',
      additional_redirect_urls: ['http://127.0.0.1:3000/auth/callback'],
      enable_signup: false,
      minimum_password_length: 12,
      password_requirements: '',
    })
    expect(config['auth.email']).toMatchObject({ enable_signup: false })
  })

  it('routes invite and recovery emails through versioned Taskovia templates', () => {
    const config = authConfig()

    expect(config['auth.email.template.invite']).toEqual({
      subject: 'Bạn được mời vào Taskovia',
      content_path: './supabase/templates/invite.html',
    })
    expect(config['auth.email.template.recovery']).toEqual({
      subject: 'Đặt lại mật khẩu Taskovia',
      content_path: './supabase/templates/recovery.html',
    })
  })
})

describe('Taskovia Auth email templates', () => {
  it('uses the canonical token-hash invite callback without browser credential tokens or scripts', () => {
    const template = emailTemplate('invite')

    expect(template).toContain('href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite"')
    expect(template).toContain('TASKOVIA')
    expect(template).toContain('<html lang="vi">')
    expect(template).not.toMatch(/(?:access_token|refresh_token|ConfirmationURL|<script\b|<\w+\b[^>]*\son\w+\s*=)/i)
  })

  it('uses the canonical token-hash recovery callback without browser credential tokens or scripts', () => {
    const template = emailTemplate('recovery')

    expect(template).toContain('href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery"')
    expect(template).toContain('TASKOVIA')
    expect(template).toContain('<html lang="vi">')
    expect(template).not.toMatch(/(?:access_token|refresh_token|ConfirmationURL|<script\b|<\w+\b[^>]*\son\w+\s*=)/i)
  })
})
