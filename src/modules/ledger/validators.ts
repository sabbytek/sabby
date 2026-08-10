import { z } from 'zod';

export const listEntriesQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
});

export type ListEntriesQuery = z.infer<typeof listEntriesQuerySchema>;
