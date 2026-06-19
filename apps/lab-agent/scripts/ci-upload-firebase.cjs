// CI helper: upload a freshly-built Lab Agent installer to Firebase Storage with
// a FIXED download token, so the public download URL stays stable across builds.
//
//   node scripts/ci-upload-firebase.cjs <ext: dmg|exe> <dest-path> <token>
//
// Auth comes from the FIREBASE_SERVICE_ACCOUNT secret (the service-account JSON)
// and STORAGE_BUCKET. Finds the built artifact by extension in ./release.
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const [, , ext, dest, token] = process.argv;
if (!ext || !dest || !token) {
    console.error("usage: ci-upload-firebase.cjs <dmg|exe> <dest> <token>");
    process.exit(1);
}

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
const bucketName = process.env.STORAGE_BUCKET;
if (!saRaw || !bucketName) {
    console.error("missing FIREBASE_SERVICE_ACCOUNT or STORAGE_BUCKET env");
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(saRaw)),
    storageBucket: bucketName,
});

const releaseDir = path.join(__dirname, "..", "release");
const artifact = fs
    .readdirSync(releaseDir)
    .find((f) => f.toLowerCase().endsWith("." + ext.toLowerCase()));
if (!artifact) {
    console.error(`no .${ext} artifact found in ${releaseDir}`);
    process.exit(1);
}

const contentType =
    ext.toLowerCase() === "dmg" ? "application/x-apple-diskimage" : "application/x-msdownload";

(async () => {
    await admin
        .storage()
        .bucket()
        .upload(path.join(releaseDir, artifact), {
            destination: dest,
            metadata: {
                contentType,
                contentDisposition: `attachment; filename="${path.basename(dest)}"`,
                cacheControl: "public, max-age=300",
                metadata: { firebaseStorageDownloadTokens: token },
            },
        });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
        dest
    )}?alt=media&token=${token}`;
    console.log("Uploaded:", artifact, "->", dest);
    console.log("Public URL:", url);
})().catch((e) => {
    console.error("upload failed:", e && e.message ? e.message : e);
    process.exit(1);
});
