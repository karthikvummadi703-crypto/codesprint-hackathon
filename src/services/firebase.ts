import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseConfigured = Boolean(
  config.apiKey && config.projectId && config.appId
);

/**
 * Backend origin.
 *
 * Falling back to localhost in a production build would make the deployed app
 * quietly call the visitor's own machine, so the default has to follow the build
 * mode. `import.meta.env.PROD` is inlined at build time.
 */
const DEV_API_BASE_URL = 'http://localhost:8001';
const PROD_API_BASE_URL = 'https://codesprint-hackathon-production.up.railway.app';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? PROD_API_BASE_URL : DEV_API_BASE_URL);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { app, auth, db, storage };
