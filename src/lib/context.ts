import type { Context } from 'hono';
import type { Admin } from '@/types';

export interface AdminContext extends Context {
  get(key: 'admin'): Admin;
  set(key: 'admin', value: Admin): void;
}