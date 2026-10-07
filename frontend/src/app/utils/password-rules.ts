/** Any printable character that is not a letter, digit or whitespace. */
export const SPECIAL_CHARACTER_PATTERN = /[^A-Za-z0-9\s]/;

export const SPECIAL_CHARACTER_ERROR =
  'Password must contain at least one special character (e.g. ! @ # $ % - _ .)';

export const SPECIAL_CHARACTER_REQUIREMENT =
  'At least one special character (e.g. ! @ # $ % - _ .)';

export function hasSpecialCharacter(password: string): boolean {
  return SPECIAL_CHARACTER_PATTERN.test(password);
}
