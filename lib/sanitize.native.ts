const stripMarkup = /<[^>]*>/g;
const stripScriptContent = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;

export const sanitizeInput = (input: string | null | undefined): string =>
  String(input || '')
    .replace(stripScriptContent, '')
    .replace(stripMarkup, '')
    .trim();
