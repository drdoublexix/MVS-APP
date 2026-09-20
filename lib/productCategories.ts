export const PRODUCT_CATEGORIES = [
  'Animal Accessories',
  'Animal Drugs',
  'Animal Feeds',
  'Animal Toys',
  'Animals',
  'Grooming Accessories',
  'Health & Care',
  'Others',
  'Pet Food',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const isProductCategory = (value: string): value is ProductCategory =>
  PRODUCT_CATEGORIES.includes(value as ProductCategory);
