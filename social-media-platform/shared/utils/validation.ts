import { z } from 'zod'

// Request schemas shared by API handlers and client-side forms.

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'At least 3 characters')
  .max(20, 'At most 20 characters')
  .regex(/^\w+$/, 'Letters, numbers and underscores only')

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Needs a lowercase letter')
  .regex(/[A-Z]/, 'Needs an uppercase letter')
  .regex(/\d/, 'Needs a number')

export const registerSchema = z.object({
  email: z.email('Enter a valid email').transform(v => v.toLowerCase()),
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(50).optional()
})

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required').max(128)
})

export const createPostSchema = z.object({
  content: z.string().trim().min(1, 'Write something').max(2000),
  images: z.array(z.url({ protocol: /^https$/ })).max(4).default([]),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS']).default('PUBLIC')
})

export const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(1000)
})

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000)
})

export const startConversationSchema = z.object({
  username: usernameSchema
})

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
})
