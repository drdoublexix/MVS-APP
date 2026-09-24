export const formatDateInput = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return [date.getDate(), date.getMonth() + 1, date.getFullYear()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
};

export const parseDateInput = (value: string): string | null => {
  const match = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) return null;
  return `${year}-${month}-${day}`;
};

export const formatDateTimeInput = (date: Date): string => formatDateInput(date);
