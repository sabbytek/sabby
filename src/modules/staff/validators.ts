import { z } from 'zod';

export const inviteStaffBodySchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['manager', 'staff', 'viewer']),
  phone: z.string().optional(),
  locationId: z.string().optional(),
  temporaryPassword: z.string().min(8),
}).strict();

export const updateStaffBodySchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(['manager', 'staff', 'viewer']).optional(),
  locationId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const idParamsSchema = z.object({
  id: z.string(),
});

export type InviteStaffBody = z.infer<typeof inviteStaffBodySchema>;
export type UpdateStaffBody = z.infer<typeof updateStaffBodySchema>;
