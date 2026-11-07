export const isVeterinaryProfessionalRole = (role?: string | null): boolean =>
  ['vet', 'veterinarian', 'paravet'].includes(role?.trim().toLowerCase() || '');

export const isVeterinarianRole = (role?: string | null): boolean =>
  ['vet', 'veterinarian'].includes(role?.trim().toLowerCase() || '');

export const getVeterinaryProfessionalLabel = (role?: string | null): string =>
  role?.trim().toLowerCase() === 'paravet' ? 'Veterinary paraprofessional' : 'Veterinarian';
