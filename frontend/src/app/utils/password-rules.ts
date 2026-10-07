/** Any character that is not a letter or digit (in any script) or whitespace. */
export const SPECIAL_CHARACTER_PATTERN = /[^\p{L}\p{N}\s]/u;

export const SPECIAL_CHARACTER_ERROR =
  'Password must contain at least one special character (e.g. ! @ # $ % - _ .)';

export const SPECIAL_CHARACTER_REQUIREMENT =
  'At least one special character (e.g. ! @ # $ % - _ .)';

export function hasSpecialCharacter(password: string): boolean {
  return SPECIAL_CHARACTER_PATTERN.test(password);
}
