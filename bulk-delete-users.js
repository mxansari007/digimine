const admin = require('firebase-admin');

// Initialize with your service account
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();

// Users to KEEP (by email or UID)
const KEEP_EMAILS = new Set([
  // Add more emails to preserve
  'mxansari007@gmail.com'
]);

const KEEP_UIDS = new Set([
  '2fNLV8B3QcMhMSN4xYlbfrRWAQj2'
  // Add more UIDs to preserve
]);

async function deleteUsers() {
  let nextPageToken;
  let deletedCount = 0;
  let keptCount = 0;
  const batchSize = 100; // Firebase allows max 100 per batch

  do {
    // List users (1000 at a time)
    const listUsersResult = await auth.listUsers(1000, nextPageToken);
    nextPageToken = listUsersResult.pageToken;

    // Filter out users to keep
    const toDelete = listUsersResult.users.filter(user => {
      const keep = KEEP_EMAILS.has(user.email) || KEEP_UIDS.has(user.uid);
      if (keep) {
        console.log(`⏭️  Keeping: ${user.email} (${user.uid})`);
        keptCount++;
      }
      return !keep;
    });

    // Delete in batches of 100
    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = toDelete.slice(i, i + batchSize);
      const uids = batch.map(u => u.uid);

      const result = await auth.deleteUsers(uids);

      // Log successes
      batch.forEach(u => console.log(`🗑️  Deleted: ${u.email} (${u.uid})`));
      deletedCount += result.successCount;

      // Log failures if any
      if (result.errors.length > 0) {
        result.errors.forEach(err => {
          console.error(`❌ Failed to delete ${uids[err.index]}: ${err.error.message}`);
        });
      }
    }

  } while (nextPageToken);

  console.log(`\n✅ Done! Deleted: ${deletedCount}, Kept: ${keptCount}`);
  process.exit(0);
}

deleteUsers().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
