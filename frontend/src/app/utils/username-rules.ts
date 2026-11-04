/**
 * The rule for a new account's username, the same as the server's
 * (`backend/src/schemas/auth.schemas.ts`): 3 to 39 ASCII letters, digits,
 * underscores and hyphens (`\w` is exactly `[A-Za-z0-9_]` without the `u`
 * flag). Only registration checks it; accounts created before the rule keep
 * their usernames.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 39;
export const USERNAME_PATTERN = /^[\w-]+$/;

/** Whether a name fits the length and character rule for new usernames. */
export function fitsUsernameRule(username: string): boolean {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(username)
  );
}
