export const parsePriceInput = (value: string): number => Number(value.replace(/,/g, '').trim());
