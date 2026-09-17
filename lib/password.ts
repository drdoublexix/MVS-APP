export const PASSWORD_REQUIREMENTS = 'Minimum 8 characters, including a capital letter, small letter, number, and symbol.';

export const isValidPassword = (password: string): boolean => (
  password.length >= 8
  && /[A-Z]/.test(password)
  && /[a-z]/.test(password)
  && /[0-9]/.test(password)
  && /[!@#$%^&*(),.?":{}|<>]/.test(password)
);
