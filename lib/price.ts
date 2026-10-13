export const parsePriceInput = (value: string): number => Number(value.replace(/,/g, '').trim());

export const addPlatformFee = (price: number): number =>
  Math.round((price * 1.1 + Number.EPSILON) * 100) / 100;
