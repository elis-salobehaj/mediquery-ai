import { z } from 'zod';

export class UserCreateDto {
  username!: string;
  password!: string;
  fullName?: string;
  email?: string;
}

export const UserCreateSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  fullName: z.string().optional(),
  email: z.string().email().optional(),
});
