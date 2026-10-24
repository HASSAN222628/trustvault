export type Role = 'admin' | 'owner' | 'viewer';
export type Access = 'owner' | 'edit' | 'read';
export type Profile = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  is_active: boolean;
};
export type DocRow = {
  id: string;
  title: string;
  description: string;
  original_filename: string;
  category: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
  owner_id: string;
  owner_name: string;
  my_access: Access;
  total_count: number;
};
export const CATEGORIES = [
  'contract',
  'salary',
  'technical',
  'audit',
  'customer',
  'general',
] as const;
