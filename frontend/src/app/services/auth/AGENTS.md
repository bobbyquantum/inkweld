# Auth services: agent notes

Sessions are JWT bearer tokens stored by `AuthTokenService` (no session
cookies). Passkey design, key files, data flow and environment variables:
`docs/site/docs/developer/passkeys.md`.

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
