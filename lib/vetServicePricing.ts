export type PricePeriod = 'monthly' | 'quarterly' | 'annual';

export type VetServicePricing = {
  services: Record<string, string>;
  bundles: Record<string, string>;
  carePlans: Record<string, Partial<Record<PricePeriod, string>>>;
};

export const pricePeriods: { id: PricePeriod; label: string }[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'annual', label: 'Annual' },
];

export const veterinaryServices = [
  { id: 'home_visit', name: 'Home visit / transport fee', description: 'Charge once for a visit to the client’s address. This is one fee even when more than one pet is seen.', unit: 'Per address' },
  { id: 'consultation', name: 'Consultation', description: 'Price for examining one pet, discussing the concern with the owner, and providing professional advice. Tests and medicines may be charged separately.', unit: 'Per pet' },
  { id: 'anti_rabies', name: 'Anti-rabies vaccine', description: 'Price for one rabies vaccine dose for a dog or cat. Update the pet’s vaccination record where applicable.', unit: 'Per dose' },
  { id: 'dhlpp', name: 'DHLPP 5-in-1 vaccine (dogs)', description: 'Price for one dose of the core 5-in-1 vaccine for dogs. Additional doses or boosters may be charged separately.', unit: 'Per dose' },
  { id: 'fvrcp', name: 'FVRCP 3-in-1 vaccine (cats)', description: 'Price for one dose of the core 3-in-1 vaccine for cats. Additional doses or boosters may be charged separately.', unit: 'Per dose' },
  { id: 'booster', name: 'Booster shots', description: 'Enter the price for one booster dose. The vaccine used and dose schedule depend on the pet’s vaccination history.', unit: 'Per dose' },
  { id: 'felv', name: 'FeLV vaccine (cats)', description: 'Price for one feline leukaemia vaccine dose. Suitability may depend on the cat’s health and vaccination history.', unit: 'Per dose' },
  { id: 'feline_chlamydia', name: 'Feline Chlamydia vaccine', description: 'Price for one vaccine dose for cats where this vaccine is recommended.', unit: 'Per dose' },
  {
    id: 'wound_management',
    name: 'Wound management',
    description: 'Set a separate price for a minor wound and a more serious wound. The final treatment and cost may depend on the wound after examination.',
    variants: [{ id: 'minor_wound', label: 'Minor wound' }, { id: 'serious_wound', label: 'Serious wound' }],
  },
  {
    id: 'deworming',
    name: 'Deworming',
    description: 'Enter a separate deworming price for each pet-size category. The correct dose depends on the pet’s actual weight and the medicine used, so confirm the final price with the owner.',
    variants: [{ id: 'small_pet', label: 'Small pet' }, { id: 'medium_pet', label: 'Medium pet' }, { id: 'large_pet', label: 'Large pet' }],
  },
  {
    id: 'flea_tick_injection',
    name: 'Flea & tick treatment (injection)',
    description: 'Price for an injectable flea and tick treatment administered by a veterinarian. Enter separate prices by animal-size category; the correct product and dose depend on the animal’s weight and assessment.',
    variants: [{ id: 'small_animal', label: 'Small animal' }, { id: 'medium_animal', label: 'Medium animal' }, { id: 'large_animal', label: 'Large animal' }],
  },
  {
    id: 'flea_tick_tablet',
    name: 'Flea & tick treatment (tablet)',
    description: 'Price for an oral flea and tick treatment tablet. Enter separate prices by animal-size category; the correct product and dose depend on the animal’s weight.',
    variants: [{ id: 'small_animal', label: 'Small animal' }, { id: 'medium_animal', label: 'Medium animal' }, { id: 'large_animal', label: 'Large animal' }],
  },
  {
    id: 'essential_grooming',
    name: 'Essential grooming',
    description: 'Basic grooming service. Enter separate prices for small, medium, and large pets based on the grooming time and coat size.',
    variants: [{ id: 'small_pet', label: 'Small pet' }, { id: 'medium_pet', label: 'Medium pet' }, { id: 'large_pet', label: 'Large pet' }],
  },
  {
    id: 'signature_grooming',
    name: 'Signature grooming & styling',
    description: 'Full grooming and styling service. Enter separate prices for small, medium, and large pets based on the work and coat size.',
    variants: [{ id: 'small_pet', label: 'Small pet' }, { id: 'medium_pet', label: 'Medium pet' }, { id: 'large_pet', label: 'Large pet' }],
  },
  { id: 'tests_sample_collection', name: 'Tests & sample collection', description: 'Enter the charge for each test or sample collection. Laboratory charges may be additional if they are not included.', unit: 'Per test' },
  { id: 'bird_beak_nail_trim', name: 'Beak and nail trim (birds)', description: 'Enter the charge to trim one bird’s beak and/or nails.', unit: 'Per bird' },
  { id: 'bird_wing_trim', name: 'Wing trim (birds)', description: 'Enter the charge to trim a bird’s flight feathers safely.', unit: 'Per bird' },
  { id: 'fumigation', name: 'Home & kennel fumigation', description: 'Enter the charge to treat one home or kennel. Explain any preparation required and whether the size of the property changes the price.', unit: 'Per home or kennel' },
] as const;

export const veterinaryBundles = [
  {
    id: 'wellness_visit',
    name: 'Wellness Visit',
    description: 'One-time package with a consultation, one core vaccine dose (DHLPP for dogs or FVRCP for cats), and medium-pet deworming. Home visit fee is waived. Enter one total upfront price for the included services.',
  },
  {
    id: 'first_year_starter',
    name: 'First-Year Starter',
    description: 'Prepaid package for three scheduled puppy or kitten visits, including the agreed vaccine series, deworming schedule, and growth checks. Enter one total upfront price and clarify any exclusions with the client.',
  },
  {
    id: 'fresh_and_covered',
    name: 'Fresh & Covered',
    description: 'One-time package with essential grooming, flea and tick treatment, and nail finishing for a medium pet. Home visit fee is waived. Enter one total upfront price for the included services.',
  },
] as const;

export const veterinaryCarePlans = [
  {
    id: 'mvs_routine_care_plan',
    name: 'MVS Routine Care Plan',
    description: 'Ongoing routine care that may include a quarterly home consultation, scheduled deworming, and priority booking. Enter the total price for each billing period you offer, and clarify visit limits or exclusions with the client.',
  },
  {
    id: 'mvs_grooming_wellness_plan',
    name: 'MVS Grooming & Wellness Plan',
    description: 'Ongoing grooming and wellness care that may include monthly signature grooming, nail and ear care, scheduled flea and tick refills, and priority booking. Enter the price for each billing period you offer, and clarify included visits or exclusions with the client.',
  },
  {
    id: 'mvs_total_care_package',
    name: 'MVS Total Care Package',
    description: 'A broader ongoing package combining routine care and grooming and wellness benefits, plus annual home fumigation, member pet-shop rates, and priority emergency referrals. Enter the price for each billing period you offer, and clarify included services or exclusions with the client.',
  },
] as const;

const asPriceMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, price]) => [
      key,
      typeof price === 'string' || typeof price === 'number' ? String(price) : '',
    ]),
  );
};

export const createEmptyVetServicePricing = (): VetServicePricing => ({
  services: {},
  bundles: {},
  carePlans: {},
});

export const normalizeVetServicePricing = (value: {
  service_prices?: unknown;
  bundle_prices?: unknown;
  care_plan_prices?: unknown;
} | null): VetServicePricing => {
  if (!value) return createEmptyVetServicePricing();

  const rawCarePlans = value.care_plan_prices;
  const carePlans: VetServicePricing['carePlans'] = {};
  if (rawCarePlans && typeof rawCarePlans === 'object' && !Array.isArray(rawCarePlans)) {
    for (const [planId, periods] of Object.entries(rawCarePlans)) {
      carePlans[planId] = asPriceMap(periods);
    }
  }

  return {
    services: asPriceMap(value.service_prices),
    bundles: asPriceMap(value.bundle_prices),
    carePlans,
  };
};

export const formatVetServicePrice = (value: string | undefined): string | null => {
  const amount = value?.trim();
  if (!amount || !/^\d+$/.test(amount) || !Number.isFinite(Number(amount))) return null;
  return `₦${Number(amount).toLocaleString('en-NG')}`;
};
