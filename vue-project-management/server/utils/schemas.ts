import { z } from 'zod'
import { TASK_STATUSES } from '#shared/types'

const priority = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])

export const createTaskSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().max(2000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: priority.optional(),
  projectId: z.string().min(1),
  assigneeIds: z.array(z.string()).max(10).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  dueDate: z.iso.datetime().optional()
})

export const updateTaskSchema = createTaskSchema
  .omit({ projectId: true })
  .partial()
  .extend({ position: z.number().int().min(0).optional() })
  .refine(value => Object.keys(value).length > 0, 'At least one field is required')

export const taskQuerySchema = z.object({
  projectId: z.string().optional(),
  assigneeId: z.string().optional()
})
