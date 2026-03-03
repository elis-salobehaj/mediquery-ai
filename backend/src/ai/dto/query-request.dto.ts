import { z } from 'zod';

export const QueryRequestSchema = z.object({
  question: z
    .string()
    .min(1, 'Question cannot be empty')
    .max(1000, 'Question too long'),
  thread_id: z.uuid('thread_id must be a valid UUID').nullable().optional(),
  model_id: z.string().nullable().optional(),
  model_provider: z.string().nullable().optional(),
  multi_agent: z.boolean().optional(),
  fast_mode: z.boolean().optional(),
  enable_memory: z.boolean().optional(),
  // Deprecated: retained for backward compatibility during mode migration.
  thinking_mode: z.boolean().optional(),
});

type QueryRequestDtoType = z.infer<typeof QueryRequestSchema>;

export class QueryRequestDto implements QueryRequestDtoType {
  question!: string;
  thread_id?: string;
  model_id?: string;
  model_provider?: string;
  multi_agent?: boolean;
  fast_mode?: boolean;
  enable_memory?: boolean;
  // Deprecated: retained for backward compatibility during mode migration.
  thinking_mode?: boolean;
}
