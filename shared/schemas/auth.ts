import { z } from 'zod'

const normalizedEmailSchema = z.string().trim().toLowerCase().email()
const passwordSchema = z.string().min(1)
const newPasswordSchema = z.string()
  .min(12)
  .max(72)
  .refine(password => /\S/.test(password), 'Password must contain a non-whitespace character.')

export type AuthEmailFlow = 'invite' | 'recovery'

export const signInInputSchema = z.object({
  email: normalizedEmailSchema,
  password: passwordSchema,
}).strict()

export const forgotPasswordInputSchema = z.object({
  email: normalizedEmailSchema,
}).strict()

export const resetPasswordInputSchema = z.object({
  password: newPasswordSchema,
  confirmation: newPasswordSchema,
}).strict().refine(
  input => input.password === input.confirmation,
  { message: 'Password confirmation must match.', path: ['confirmation'] },
)

export const authCallbackQuerySchema = z.object({
  token_hash: z.string().min(1),
  type: z.enum(['invite', 'recovery']),
}).strict()
