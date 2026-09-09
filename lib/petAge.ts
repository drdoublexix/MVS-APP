export function calculatePetAgeInWeeks(dob: string | Date | null | undefined): string {
  if (!dob) return 'Unknown age';

  const birthDate = typeof dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dob)
    ? new Date(`${dob}T00:00:00`)
    : new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return 'Unknown age';

  const today = new Date();
  const diffInMs = today.getTime() - birthDate.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays < 0) return '0 Weeks';
  const weeks = Math.floor(diffInDays / 7);

  return `${weeks} ${weeks === 1 ? 'Week' : 'Weeks'}`;
}