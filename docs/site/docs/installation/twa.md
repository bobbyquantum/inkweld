# Trusted Web Activity (Android App)

Inkweld can be wrapped as a **Trusted Web Activity** (TWA), turning your
self-hosted PWA into a native Android app publishable on the Google Play Store.

## How it works

A TWA is a thin native Android shell that opens your PWA in a full-screen Chrome
Custom Tab without browser UI. The `android/` Gradle project uses
[android-browser-helper](https://github.com/GoogleChromeLabs/android-browser-helper)
— the library behind Google's Bubblewrap CLI.

The link between your website and the Android app is verified through **Digital
Asset Links** — a `/.well-known/assetlinks.json` file served on your domain that
contains your app's package name and signing key fingerprint.

## Prerequisites

- **Java 21** (JDK) — `keytool` included, used to generate signing keys
- **Android SDK** (API 35+) — install via Android Studio or `sdkmanager`

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Run the interactive setup script:
   ```bash
   bun run twa:setup
   ```

   The script will ask for:
   - **Package name** — reverse-domain style, e.g. `app.inkweld`
   - **App display name** — shown on the home screen
   - **Preview host** — your staging domain (e.g. `preview.yourdomain.com`)
   - **Production host** — your live domain (e.g. `yourdomain.com`)
   - **Keystore** — a signing key for the APK/AAB (the script can generate one)

   This updates:
   - `android/app/build.gradle.kts` — host names for product flavors
   - `frontend/public/.well-known/assetlinks.json` — Digital Asset Links file

## Build

Two product flavors are available:

| Command | Flavor | Output | Use case |
|---|---|---|---|
| `bun run twa:build:preview` | preview | APK | Side-loading, internal testing |
| `bun run twa:bundle:prod` | prod | AAB | Play Store submission |

The preview variant appends `.preview` to the package name (so it can be
installed alongside the production app) and points at your preview host.

### Signing locally

Set these properties in `~/.gradle/gradle.properties` (or pass as env vars):

```properties
KEYSTORE_PATH=android/inkweld-release.keystore
KEYSTORE_PASSWORD=your-password
KEY_ALIAS=inkweld
KEY_PASSWORD=your-password
```

Or use Gradle project properties:
```bash
./gradlew assemblePreviewRelease \
  -PKEYSTORE_PATH=inkweld-release.keystore \
  -PKEYSTORE_PASSWORD=... \
  -PKEY_ALIAS=inkweld \
  -PKEY_PASSWORD=...
```

## Deploy assetlinks.json

The `twa:setup` script generates `frontend/public/.well-known/assetlinks.json`.
Deploy it with every frontend build:

```bash
# Cloudflare Pages
npm run cloudflare:preview:deploy  # Preview
npm run cloudflare:prod:deploy      # Production

# Docker
npm run docker:prod
```

Google's Play Console checks this file to verify your app owns the domain.
It must be accessible at `https://<your-host>/.well-known/assetlinks.json` on
**both** your preview and production domains.

## Verify Digital Asset Links

After deploying, verify the link with Google's tool:

https://developers.google.com/digital-asset-links/tools/generator

Enter your host and package name. The tool checks that your `assetlinks.json`
matches the expected format.

## Test locally

Set up signing (see above), connect an Android device via USB with developer
mode enabled, then:

```bash
bun run twa:install:preview
```

## GitHub Actions CI

The **TWA Build** workflow is triggered manually via `workflow_dispatch`. Since
the TWA wrapper rarely changes, it does not run on every push.

1. Go to **Actions → TWA Build → Run workflow**
2. Select **preview** or **prod** environment
3. Optionally override the preview/prod hosts
4. The workflow builds a signed AAB (prod) or APK (preview) and uploads it as
   an artifact

### Required GitHub Actions secrets

| Secret | Description |
|---|---|
| `TWA_KEYSTORE_BASE64` | Base64-encoded `.keystore` file |
| `TWA_KEYSTORE_PASSWORD` | Keystore password |
| `TWA_KEY_ALIAS` | Key alias inside the keystore |
| `TWA_KEY_PASSWORD` | Key password (same as keystore if auto-generated) |

Encode your keystore for the secret:
```bash
base64 < android/inkweld-release.keystore | pbcopy  # macOS
base64 < android/inkweld-release.keystore           # Linux — pipe to clipboard or copy
```

## Play Store submission

1. Trigger the CI workflow: **Actions → TWA Build → Run workflow** (select prod)
2. Download the signed AAB from the workflow artifacts
3. Create a new app in [Google Play Console](https://play.google.com/console)
4. Upload the AAB under **Production → App bundles**
5. Complete the store listing (description, screenshots, privacy policy)
6. Google will verify `assetlinks.json` automatically
7. Submit for review

The TWA approach means your app is always up-to-date with your deployed PWA —
no separate app update cycle needed.

## Troubleshooting

**"App not linked to website" error in Play Console**
- Verify `assetlinks.json` is accessible at `https://<host>/.well-known/assetlinks.json`
- Check the SHA256 fingerprint matches your signing key
- Ensure `android:autoVerify="true"` is set in the manifest's intent filter

**Gradle build fails with signing errors**
- Verify `gradle.properties` or env vars have correct signing values
- Re-run `bun run twa:setup` to regenerate the config

**Wrong host in the built APK**
- The hosts are set in `android/app/build.gradle.kts` under `productFlavors`
- Run `bun run twa:setup` to update them interactively
- Or edit `manifestPlaceholders["twaHost"]` directly in the gradle file
