import { describe, expect, it } from 'vitest'
import {
  authCallbackQuerySchema,
  forgotPasswordInputSchema,
  resetPasswordInputSchema,
  signInInputSchema,
} from '../../../shared/schemas/auth'

describe('auth schemas', () => {
  it('normalizes email without transforming the sign-in password', () => {
    expect(signInInputSchema.parse({
      email: '  USER@example.com ',
      password: ' old password ',
    })).toEqual({
      email: 'user@example.com',
      password: ' old password ',
    })
  })

  it('accepts a normalized email for generic password-reset requests', () => {
    expect(forgotPasswordInputSchema.parse({ email: '  USER@example.com ' }))
      .toEqual({ email: 'user@example.com' })
  })

  it('enforces the exact passphrase bounds, non-whitespace content, and confirmation', () => {
    expect(resetPasswordInputSchema.safeParse({
      password: 'twelve chars',
      confirmation: 'twelve chars',
    }).success).toBe(true)

    expect(resetPasswordInputSchema.safeParse({
      password: ' '.repeat(12),
      confirmation: ' '.repeat(12),
    }).success).toBe(false)

    expect(resetPasswordInputSchema.safeParse({
      password: 'a'.repeat(73),
      confirmation: 'a'.repeat(73),
    }).success).toBe(false)

    expect(resetPasswordInputSchema.safeParse({
      password: 'twelve chars',
      confirmation: 'different pass',
    }).success).toBe(false)
  })

  it('accepts only one token hash and an invite or recovery callback flow', () => {
    expect(authCallbackQuerySchema.parse({
      token_hash: 'opaque-token-hash',
      type: 'invite',
    })).toEqual({ token_hash: 'opaque-token-hash', type: 'invite' })
    expect(authCallbackQuerySchema.safeParse({
      token_hash: ['opaque-token-hash'],
      type: 'invite',
    }).success).toBe(false)
    expect(authCallbackQuerySchema.safeParse({
      token_hash: 'opaque-token-hash',
      type: 'signup',
    }).success).toBe(false)
    expect(authCallbackQuerySchema.safeParse({ type: 'recovery' }).success).toBe(false)
  })
})
