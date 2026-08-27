import { describe, expect, it } from 'vitest'
import {
  buildAuthCallbackUrl,
  parseCanonicalAppUrl,
  sanitizeInternalRedirect,
} from '../../../shared/utils/app-url'

describe('canonical app URL', () => {
  it('accepts an HTTPS origin and builds the exact callback path', () => {
    expect(parseCanonicalAppUrl('https://app.taskovia.example').origin)
      .toBe('https://app.taskovia.example')
    expect(buildAuthCallbackUrl('https://app.taskovia.example/'))
      .toBe('https://app.taskovia.example/auth/callback')
  })

  it.each([
    'http://app.taskovia.example',
    'https://app.taskovia.example/settings',
    'https://app.taskovia.example?next=/projects',
    'https://app.taskovia.example#fragment',
    'https://user:password@app.taskovia.example',
    'http://localhost.evil.example',
    'http://127.0.0.1.nip.io',
  ])('rejects an unsafe or non-canonical app URL: %s', value => {
    expect(() => parseCanonicalAppUrl(value)).toThrow()
  })

  it.each(['http://localhost:3000', 'http://127.0.0.1:3000'])(
    'permits local development origin %s',
    value => {
      expect(buildAuthCallbackUrl(value)).toBe(`${value}/auth/callback`)
    },
  )
})

describe('internal redirect sanitizer', () => {
  it.each([
    '//evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    '/login',
    '/forgot-password',
    '/auth/callback',
    '/reset-password',
    '/\\evil.example',
    '/projects%0Ahttps://evil.example',
  ])('rejects an unsafe post-login destination: %s', value => {
    expect(sanitizeInternalRedirect(value)).toBeNull()
  })

  it('preserves an internal business path and its query', () => {
    expect(sanitizeInternalRedirect('/projects?tab=active')).toBe('/projects?tab=active')
  })
})
