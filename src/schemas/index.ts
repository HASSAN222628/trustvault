import { z } from 'zod';
import { CATEGORIES } from '@/types';

export const MAX_UPLOAD = 5 * 1024 * 1024;
export const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(10, 'At least 10 characters'),
});
export const registerSchema = loginSchema.extend({
  display_name: z.string().trim().min(1, 'Required').max(120),
});
export const docSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(2000),
  category: z.enum(CATEGORIES),
});
export const shareSchema = z.object({ permission: z.enum(['read', 'edit']) });
export const checkFile = (f: File | undefined): string | null => {
  if (!f) return 'Choose a file';
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(f.type))
    return 'Only PDF, PNG or JPEG files';
  if (f.size > MAX_UPLOAD) return 'File is larger than 5 MB';
  return null; // UX only; the server re-validates signature, type and size
};
