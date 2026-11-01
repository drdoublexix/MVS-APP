export const PLATFORM_FEE_PERCENT = 5;

export const parsePriceInput = (value: string): number => Number(value.replace(/,/g, '').trim());

export const addPlatformFee = (price: number): number =>
  Math.round((price * (1 + PLATFORM_FEE_PERCENT / 100) + Number.EPSILON) * 100) / 100;
