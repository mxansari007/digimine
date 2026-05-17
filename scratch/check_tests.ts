import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

// Check if we have service account
const serviceAccountPath = '/Users/maazansari/digimine/firebase-service-account.json';
if (!fs.existsSync(serviceAccountPath)) {
    console.log('Service account not found at ' + serviceAccountPath);
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function checkTests() {
  const testsSnapshot = await db.collection('tests').get();
  console.log(`Found ${testsSnapshot.size} test series.`);
  testsSnapshot.forEach(doc => {
    console.log(`- ID: ${doc.id}, Title: ${doc.data().title}, Status: ${doc.data().status}`);
  });
}

checkTests();
