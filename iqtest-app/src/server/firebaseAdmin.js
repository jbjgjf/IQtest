const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!admin.apps.length) {
  if (!projectId || !clientEmail || !rawPrivateKey) {
    throw new Error('Missing Firebase Admin configuration.');
  }

  const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

const db = admin.firestore();

module.exports = { admin, db };
