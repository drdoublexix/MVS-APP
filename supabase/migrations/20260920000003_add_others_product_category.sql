alter table public.products
  drop constraint if exists products_category_check;

alter table public.products
  add constraint products_category_check
  check (category in (
    'Animal Accessories',
    'Animal Drugs',
    'Animal Feeds',
    'Animal Toys',
    'Animals',
    'Grooming Accessories',
    'Health & Care',
    'Others',
    'Pet Food'
  ));