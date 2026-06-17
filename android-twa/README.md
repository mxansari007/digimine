# PlacementRanker → Android APK (TWA wrapper)

This folder wraps the live PWA (`https://www.placementranker.com`) as an
installable Android app using a **Trusted Web Activity (TWA)**. The APK is a thin
shell that loads the live site — it is **not** an offline copy (the app is
server-rendered + Firebase, so it needs the hosted URL).

> ⚠️ The APK shows whatever is **deployed to placementranker.com**. The mobile
> changes made locally are NOT in the APK until the site is redeployed.

## Option A — PWABuilder (fastest, no local toolchain)
1. Go to https://www.pwabuilder.com
2. Enter `https://www.placementranker.com` → **Start**.
3. **Package For Stores → Android → Download**. You get a signed `.apk`
   (for sideloading / WhatsApp) + an `assetlinks.json`.
4. Send the `.apk` over WhatsApp. The recipient enables "Install unknown apps"
   for WhatsApp, taps the file, installs.
5. (Optional, to hide the URL bar) upload the provided `assetlinks.json` to
   `https://www.placementranker.com/.well-known/assetlinks.json`.

## Option B — Build locally with Bubblewrap
Requires JDK (present) + Android SDK (Bubblewrap can auto-download it).

```bash
cd /Users/maazansari/digimine/android-twa
# 1. generate a signing key (sideload-grade; remember the passwords)
keytool -genkeypair -v -keystore android.keystore -alias placementranker \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=PlacementRanker, O=PlacementRanker, C=IN"
# 2. build (Bubblewrap pulls the Android SDK + build-tools on first run)
npx @bubblewrap/cli build --manifest=./twa-manifest.json --skipPwaValidation
# → produces app-release-signed.apk  ← this is the file you send on WhatsApp
```

Installing on the phone: WhatsApp → open the `.apk` → "Install unknown apps"
for WhatsApp must be allowed → Install. (Sideloaded TWAs keep a small address
bar at the top unless `assetlinks.json` with this keystore's SHA-256 is hosted
on the domain.)
