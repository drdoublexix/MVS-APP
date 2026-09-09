import DOMPurify from 'isomorphic-dompurify';

export const sanitizeInput = (input: string | null | undefined): string =>
  DOMPurify.sanitize(String(input || '').trim());
