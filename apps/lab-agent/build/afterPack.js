const { execFileSync } = require("node:child_process");
const path = require("node:path");

/**
 * Ad-hoc code-sign the packed .app on macOS.
 *
 * Without a paid Apple Developer ID, electron-builder skips signing entirely,
 * leaving an UNSIGNED arm64 app. When such an app is downloaded (quarantine
 * flag set), Apple-Silicon Gatekeeper rejects it as "is damaged and can't be
 * opened — move it to the Bin". An AD-HOC signature (`codesign --sign -`) makes
 * the signature valid (just untrusted), so the app instead shows the normal
 * "unidentified developer" prompt and opens via right-click → Open (or
 * `xattr -dr com.apple.quarantine`). Real notarization still needs a Developer
 * ID; this is the best we can do without one.
 *
 * Runs after the app is packed but BEFORE the dmg/zip targets are built, so the
 * installers contain the signed app.
 */
exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== "darwin") return;
    const appName = `${context.packager.appInfo.productFilename}.app`;
    const appPath = path.join(context.appOutDir, appName);
    console.log(`[afterPack] ad-hoc signing ${appPath}`);
    // Sign inside-out (--deep) with the ad-hoc identity ("-"), no timestamp.
    execFileSync(
        "codesign",
        ["--force", "--deep", "--sign", "-", "--timestamp=none", appPath],
        { stdio: "inherit" }
    );
    // Fail the build if the signature isn't valid — an invalid sig is exactly
    // what produces the "damaged" error, so we never ship one silently.
    execFileSync(
        "codesign",
        ["--verify", "--deep", "--strict", "--verbose=2", appPath],
        { stdio: "inherit" }
    );
    console.log("[afterPack] ad-hoc signature verified OK");
};
