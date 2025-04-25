// src/env/firebaseConfig.tsx
// This file initializes Firebase and reads configuration from environment variables

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getAnalytics } from 'firebase/analytics';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// Vite exposes environment variables prefixed with VITE_ via import.meta.env
// These values are REPLACED during the build process with the actual string values
// available in the environment where the build command runs (e.g., GitHub Actions)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string, // Cast for TypeScript
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined, // Optional
};

const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined; // App Check key

// Basic validation
const isFirebaseConfigValid = firebaseConfig.projectId && firebaseConfig.apiKey && firebaseConfig.appId;

let app: FirebaseApp | undefined; // Use undefined initially
let authInitialized = false;
let firestoreInitialized = false;
let functionsInitialized = false;
let analyticsInitialized = false;
let appCheckInitialized = false;

let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;
let functions: ReturnType<typeof getFunctions> | null = null;
let analytics: ReturnType<typeof getAnalytics> | null = null;

if (isFirebaseConfigValid) {
  console.log('Firebase config loaded: SUCCESS');
  console.log('Initializing Firebase App...');
  app = initializeApp(firebaseConfig);
  console.log('Firebase App initialized.');

  // Initialize App Check only if site key is provided
  if (recaptchaSiteKey) {
    console.log('Initializing App Check...');
    // Set up debug token for local development (Vite dev server on localhost)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
       // Use the specific debug token from env if provided, otherwise just enable debug mode
       (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
       console.log('App Check debug token flag set for localhost.');
    }

    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      // Optional: set to true to see SDK debug output (useful for debugging app check itself)
      // isTokenAutoRefreshEnabled: true, // Default is true
      // isTokenAutoRefreshEnabled: import.meta.env.MODE !== 'development' // Example: Disable auto-refresh in dev if needed
    });
     appCheckInitialized = true;
     console.log(`Firebase App Check initialized successfully with reCAPTCHA v3 provider (${window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'Development' : 'Production'} mode).`);

  } else {
      console.warn('VITE_RECAPTCHA_SITE_KEY is not defined in environment variables. App Check will not be initialized.');
  }


  // Initialize Firebase services if app is initialized
  try {
    auth = getAuth(app);
    authInitialized = true;
    console.log('Firebase Auth initialized.');
  } catch (e) { console.error('Failed to initialize Firebase Auth:', e); }

  try {
    db = getFirestore(app);
    firestoreInitialized = true;
    console.log('Firebase Firestore initialized.');
     // Emulators are configured in firebaseService.ts *after* initialization
  } catch (e) { console.error('Failed to initialize Firebase Firestore:', e); }

  try {
    const functionsRegion = 'us-central1'; // Hardcoded region based on firebase.json
    functions = getFunctions(app, functionsRegion);
    functionsInitialized = true;
    console.log(`[FirebaseService] Firebase Functions service initialized for region ${functionsRegion}.`);
     // Emulators are configured in firebaseService.ts *after* initialization
  } catch (e) { console.error('Failed to initialize Firebase Functions:', e); }

  try {
    if (firebaseConfig.measurementId) {
       analytics = getAnalytics(app);
       analyticsInitialized = true;
       console.log('Firebase Analytics initialized.');
    } else {
        console.warn('Firebase Measurement ID is not defined. Analytics will not be initialized.');
    }
  } catch (e) { console.error('Failed to initialize Firebase Analytics:', e); }


  console.log(`[FirebaseService] Firebase initialized successfully (${import.meta.env.MODE === 'development' ? 'development' : 'production'} mode)`);

} else {
  console.error('Firebase config is missing required environment variables (Project ID, API Key, or App ID).');
  // You might want to display a user-facing error here
}


// Export the initialized app and services
// Only export if app was initialized successfully
export const initializedApp = app;
export const firebaseAuth = auth;
export const firebaseFirestore = db;
export const firebaseFunctions = functions;
export const firebaseAnalytics = analytics;
export const isAppCheckInitialized = appCheckInitialized;

// Note: Emulator connection logic should happen in your firebaseService.ts
// based on window.location.hostname or import.meta.env.MODE