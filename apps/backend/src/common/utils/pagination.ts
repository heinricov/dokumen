import { MAX_PAGE_SIZE } from '@workspace/types';

export function sanitizePage(page: number | undefined): number {
  return Math.max(1, Number(page) || 1);
}

export function sanitizeLimit(limit: number | undefined): number {
  const value = Math.max(1, Number(limit) || 10);
  return Math.min(value, MAX_PAGE_SIZE);
}
