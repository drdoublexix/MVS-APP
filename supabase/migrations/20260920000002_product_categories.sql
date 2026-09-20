-- Consolidate historical labels before enforcing the canonical product categories.
update public.products
set category = case category
  when 'Dog Accessories' then 'Animal Accessories'
  when 'Cat Accessories' then 'Animal Accessories'
  when 'Accessories' then 'Animal Accessories'
  when 'Grooming' then 'Grooming Accessories'
  when 'Toys' then 'Animal Toys'
  when 'Food' then 'Animal Feeds'
  when 'Agro-allied' then 'Animal Feeds'
  when 'General' then 'Animals'
  else category
end
where category in (
  'Dog Accessories',
  'Cat Accessories',
  'Accessories',
  'Grooming',
  'Toys',
  'Food',
  'Agro-allied',
  'General'
);

update public.products
set category = 'Animals'
where category is null
   or category not in (
     'Animal Accessories',
     'Animal Drugs',
     'Animal Feeds',
     'Animal Toys',
     'Animals',
     'Grooming Accessories',
    'Health & Care',
    'Others',
     'Pet Food'
   );

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