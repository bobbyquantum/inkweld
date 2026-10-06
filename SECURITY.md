# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub instead:
[**Report a vulnerability**](https://github.com/bobbyquantum/inkweld/security/advisories/new)
(the repository's *Security* tab → *Report a vulnerability*). Only the
maintainers can see the report, and we can discuss and fix it there before
anything is published.

Helpful things to include:

- What an attacker can do, and what they need first (an account? admin? a
  collaborator invite? a crafted project archive?)
- Steps or a proof of concept
- Affected version, or commit, and how Inkweld was deployed (Docker, native
  binary, Cloudflare Workers, desktop app)

Inkweld is maintained by a small team. We aim to acknowledge a report within
7 days and to agree a disclosure date with you once a fix is ready. We will
credit you in the advisory unless you would rather we didn't.

## Supported versions

Security fixes go into the latest release. Until 1.0, only the latest release
and `main` are supported. After 1.0, the latest minor release of the current
major version is supported.

Self-hosters: watch the repository's releases, and keep a backup before every
upgrade (see the [installation docs](docs/site/docs/installation/)).

## Scope

In scope: the web app, the backend API and WebSocket sync, the MCP server and
its OAuth flow, the Docker image, the native binaries and the desktop and
Android wrappers in this repository.

These are intended behaviour, not vulnerabilities:

- **Administrator custom HTML** (`CUSTOM_HEAD_HTML` / `CUSTOM_BODY_HTML`) is
  injected into every page unsanitized. Admins are trusted; the
  Content-Security-Policy allows the scripts it contains.
- **AI provider keys and MCP access** act with the permissions the admin or
  user granted them.
- **Projects opened in the browser-only and Cloud Sync modes** are stored on
  the user's device or in their own cloud storage, protected by that device or
  account rather than by Inkweld.

Problems in a third-party dependency belong upstream, but please tell us too if
Inkweld is exposed by one.
