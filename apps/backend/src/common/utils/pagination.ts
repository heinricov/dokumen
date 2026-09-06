import { MAX_PAGE_NUMBER, MAX_PAGE_SIZE } from '@workspace/types';

export function sanitizePage(page: number | undefined): number {
  const value = Math.max(1, Number(page) || 1);
  return Math.min(value, MAX_PAGE_NUMBER);
}

export function sanitizeLimit(limit: number | undefined): number {
  const value = Math.max(1, Number(limit) || 10);
  return Math.min(value, MAX_PAGE_SIZE);
}
