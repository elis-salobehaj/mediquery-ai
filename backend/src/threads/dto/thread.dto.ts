import { z } from 'zod';

export const ThreadCreateSchema = z.object({
  title: z.string().default('New Chat'),
});

export type ThreadCreateDto = z.infer<typeof ThreadCreateSchema>;

export const ThreadUpdateSchema = z.object({
  title: z.string().optional(),
  pinned: z.boolean().optional(),
});

export type ThreadUpdateDto = z.infer<typeof ThreadUpdateSchema>;
