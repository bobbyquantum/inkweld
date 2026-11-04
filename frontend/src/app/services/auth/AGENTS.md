# Auth services: agent notes

Sessions are JWT bearer tokens stored by `AuthTokenService` (no session
cookies). Passkey design, key files, data flow and environment variables:
`docs/site/docs/developer/passkeys.md`.

## The session token goes to the active profile's server only

- Anything that sends the token asks `AuthTokenService.getTokenForUrl(url)`
  with the URL it is about to contact, and gets `null` unless that URL is on
  the active profile's server: the same origin (`ws:`/`wss:` count as
  `http:`/`https:`) and, for a server under a path prefix (Home Assistant
  ingress, a reverse proxy), a path inside that prefix with no `.` or `..`
  segment written as `%2F`, `%5C` or `%2E` (a proxy that decodes the path
  before routing would send it elsewhere). Relative URLs are resolved
  against the page's base URL. Browser and Cloud Sync profiles have no
  server, so they never send one. `getToken()` is for reading the stored
  value, not for sending it.
- A server profile without a stored address uses what the API client falls
  back to: the build's `apiUrl`, or (Docker, native binary) the page's own
  origin and base href.
- **A stored token records its server.** Each server profile's token is
  stored with the `serverAddress()` of the profile's server
  (`srv:<id>:auth_token_server`), and `getToken()` / `getTokenForConfig()`
  only return it while the profile's server has that address. Tabs can
  disagree about which server an id belongs to (one still showing a profile
  another tab removed, after the id went to a new server there), and this
  keeps each token with its own server. A token stored before the address
  was kept gets it on its first read. Write tokens only through
  `AuthTokenService` (`setToken`, `setTokenForConfig`, `moveToken`, which
  keeps the address).
- `AuthInterceptor` applies this to every `HttpClient` request, so a request
  to another server (the server being added in the profile manager, the home
  server's `/config/features`, a file on another origin) goes out without
  `Authorization`. It only clears the token and redirects on a 401 about the
  session the request carried: from the active server, with the same profile
  still active and holding the same token (not after a switch to another
  profile, another author's sign-in on the same server, or signing in
  again). Set `SKIP_AUTH_TOKEN` in the request's `HttpContext` for a request
  that must never carry the session (the registration form's username
  check).
- `fetch` calls with a manual `Authorization` header (published files, image
  streaming) and WebSocket sign-in (documents, elements, worldbuilding, and
  their re-authentication after a reconnect) use `getTokenForUrl` with the
  URL they connect to. A socket opened for one server therefore never sends
  another profile's token, even when the profile manager switches profiles
  without a reload.

## Passkeys (frontend)

- Backend timestamps (`createdAt`, `lastUsedAt`) are stored in **seconds**. The
  frontend `formatDate()` multiplies by 1000 before constructing a `Date`. Do
  not "fix" this.
- The login dialog's `onPasskeyLogin()` calls `userService.setCurrentUser(user)`
  after a successful passkey login to sync the user cache.
- The Angular API client returns `Observable<HttpEvent<T>>` — in unit tests,
  use an `obs()` helper returning `Observable<any>` to avoid TypeScript errors
  with mock return values.
- **Moving Browser projects to a server** signs in to a server that is not the
  active profile's: read that server's features with
  `SetupService.fetchServerFeatures()` (passed to `RegistrationFormComponent`'s
  `serverFeatures`), not `SystemConfigService`, which describes the Browser
  profile. Any failure, cancel or dialog close switches back and removes the
  profiles the flow created, and it calls
  `PasskeyService.login({ reloadOnProfileChange: false })`. Full flow in the
  passkeys doc above; e2e: `e2e/online/move-to-passkey-server.spec.ts`.

## Policy acceptance

`PolicyAcceptanceService` (started from `AppComponent`) shows a blocking dialog
to signed-in users whose `users.policyAcceptedVersion` is stale, via
`GET/POST /api/v1/users/me/policy-acceptance`. Declining signs out. Full
design: `docs/site/docs/developer/legal-pages-and-custom-html.md`.

- The service resolves `SystemConfigService` lazily, only once a server user
  is signed in: creating it at startup would cache features from before
  first-run setup picks a server (setup navigates on without reloading).
- `/privacy`, `/terms` and `/delete-account` are reserved usernames and must
  stay above the `:username` route. The gate never opens while `/privacy` or
  `/terms` is the current route, and waits for the first `NavigationEnd`
  (before it, `router.url` is `/`), so a policy opened in a new tab can be
  read. `/delete-account` is exempt too, so someone who won't accept new terms
  can still delete their account.
- Acceptance is a UI gate only: the API, MCP and WebSockets keep working for
  an account that has not accepted.
