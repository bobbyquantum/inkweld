/**
 * Verified-email selection for GitHub sign-in.
 *
 * The OAuth middleware's `user.email` is GitHub's primary address with no
 * regard to its `verified` flag, falling back to any non-noreply address.
 * GitHub lets an account list addresses it has not confirmed, so only a
 * verified address is stored on an Inkweld account or checked against the
 * addresses other accounts use. Accounts are matched by GitHub id, never by
 * email.
 */

export interface GithubEmailEntry {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility?: string | null;
}

/** Prefer the verified primary address, then any verified address; null otherwise. */
export function selectVerifiedGithubEmail(emails: readonly GithubEmailEntry[]): string | null {
  const usable = emails.filter(
    (e) => e.verified && typeof e.email === 'string' && e.email.length > 0
  );
  return usable.find((e) => e.primary)?.email ?? usable[0]?.email ?? null;
}

/**
 * Fetch the account's addresses from GitHub and return a verified one, or
 * null if none is verified or the request fails (sign-in then proceeds
 * without an email address).
 */
export async function fetchVerifiedGithubEmail(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  try {
    const response = await fetchImpl('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'inkweld',
      },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) return null;
    return selectVerifiedGithubEmail(body as GithubEmailEntry[]);
  } catch {
    return null;
  }
}

/** The subset of the OAuth middleware's GitHub user object this module reads. */
export interface GithubOAuthUser {
  id?: number | string;
  login?: string;
  name?: string;
}

export interface GithubProfile {
  githubId: string;
  username: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/**
 * Build the profile handed to `userService.createOrUpdateGithubUser` from the
 * middleware's user object plus a verified email looked up with the access
 * token. Without a token, or when GitHub reports no verified address, the
 * profile carries an empty, unverified email, so no unconfirmed address is
 * stored or checked against other accounts.
 */
export async function resolveGithubProfile(
  githubUser: GithubOAuthUser,
  accessToken: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<GithubProfile> {
  const verifiedEmail = accessToken ? await fetchVerifiedGithubEmail(accessToken, fetchImpl) : null;
  const login = githubUser.login || `github-${githubUser.id}`;
  return {
    githubId: String(githubUser.id),
    username: login,
    email: verifiedEmail ?? '',
    emailVerified: verifiedEmail !== null,
    name: githubUser.name || login,
  };
}
