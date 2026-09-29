import { z } from 'zod';

export const createExpenseBodySchema = z
  .object({
    description: z.string().min(1),
    amountKobo: z.number().int().min(1),
    category: z.enum([
      'rent',
      'utilities',
      'salaries',
      'marketing',
      'supplies',
      'transport',
      'other',
    ]),
    expenseDate: z.string().datetime(),
    locationId: z.string().optional(),
    receiptUrl: z
      .string()
      .optional()
      .describe(
        'The `ref` from POST /v1/uploads/image?visibility=private (or an external URL). ' +
          'Responses return a signed link valid for 1 hour.',
      ),
  })
  .strict();

export const listExpensesQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  category: z.string().optional(),
  locationId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const idParamsSchema = z.object({
  id: z.string(),
});

export type CreateExpenseBody = z.infer<typeof createExpenseBodySchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
