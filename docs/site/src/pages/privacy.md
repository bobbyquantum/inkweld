---
title: Privacy Policy
description: How the Inkweld app handles your data.
---

# Privacy Policy

**Last updated:** 9 October 2026

This policy covers **the Inkweld app**: the
web app at [inkweld.app](https://inkweld.app) and the Android app
(`app.inkweld`) on Google Play, which opens the same web app.

Inkweld is a writing app that keeps your work on your own device. I do not run
a server for your writing, I do not offer accounts, and **I do not collect,
receive or store your personal data or your writing**.

## The short version

- **No accounts, no ads, no analytics, no tracking.** The app contains no
  advertising, analytics, crash-reporting or tracking code.
- **Your writing stays on your device** unless you choose to connect your own
  cloud storage or an Inkweld server run by someone else. In both cases the app
  talks directly to that service; nothing passes through me.
- **I never sell or share your data**, because I never have it.

## Who I am

I'm [**BobbyQuantum**](https://github.com/bobbyquantum), and I make and
publish Inkweld. If you have a question about privacy, email me at
[**bobby@quantum.observer**](mailto:bobby@quantum.observer).

## Data stored on your device

Your projects, documents, images, settings and preferences are stored in your
browser or device storage (IndexedDB and local storage) on your device. They are
not sent to me. Uninstalling the app or clearing its site data deletes them, so
export your projects (as `.inkweld.zip` archives) if you want a backup.

The app uses this device storage only to work: it is not used for tracking, and
the app sets no advertising or analytics cookies.

## Optional: your own cloud storage

You can link a cloud storage account to back up your projects and keep them in
step across your devices. Currently supported:

- **Dropbox**: the app asks for "App folder" access, so it can only see its own
  folder in your Dropbox. You sign in with Dropbox directly; the resulting access
  token is stored on your device.
- **Nextcloud**: you enter your own Nextcloud server address and an app
  password. They are stored on your device and sent only to that server.

When you link an account, the app copies your projects to that storage and reads
them back from it, directly from your device. **I never see your files or your
credentials.** The provider handles your data under its own privacy policy (for
example [Dropbox's](https://www.dropbox.com/privacy), or that of whoever runs
your Nextcloud server). You can unlink the account in the app at any time and
remove the app's access from your provider's account settings.

If I add more storage providers, they will work the same way, and I will list
them here.

## Optional: Inkweld servers run by others

Inkweld is open-source, and anyone can run an Inkweld server for real-time
collaboration. The app can connect to one if you enter its address. **I do not
operate any server that you can connect to**, so a server you use is always run
by a third party (or by you).

When you connect to a server, the data you store there (an account, your
projects, and anything else that server offers, such as AI features) is
controlled by **that server's operator**, under their privacy policy. A server
that publishes one shows it at `/privacy` on that server and links to it from
its sign-in page. I have no access to it.

If you run your own Inkweld server, see
[Legal pages](/docs/admin-guide/custom-html) for how to publish your own
privacy policy.

## Hosting

The app's files (its code and assets) are served by
[Cloudflare](https://www.cloudflare.com/privacypolicy/). As with any website,
loading them involves a network request, so Cloudflare processes your IP
address and browser details to deliver the files and protect the site from
abuse. I do not use this information to identify or track you. Once installed,
the app works offline.

## Children

Inkweld is not directed at children under 13. As I collect no personal data,
I do not knowingly collect any from children.

## Your rights

Because your data stays on your device and in services you choose, you control
it directly: you can export or delete your projects in the app, unlink cloud
storage at any time, and contact a server's operator about data held on their
server. If you have any question about your data, contact me at the address
above.

## Changes

If the app's handling of data changes (for example, if I start offering a
hosted server), I will update this page and the "Last updated" date before the
change takes effect.
