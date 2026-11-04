export const formatVetDisplayName = (
  name?: string | null,
  role?: string | null,
): string => {
  const cleanName = name?.trim() || '';
  if (!['vet', 'veterinarian'].includes(role?.trim().toLowerCase() || '')) {
    return cleanName;
  }
  if (!cleanName || cleanName.toLowerCase() === 'veterinarian') return 'Veterinarian';
  return /^(dr\.?\s+|doctor\s+)/i.test(cleanName) ? cleanName : `Dr. ${cleanName}`;
};
