// src/env/firebaseConfig.tsx
// This file initializes Firebase and reads configuration from environment variables

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';
import { getAnalytics, Analytics } from 'firebase/analytics';
import { initializeAppCheck, ReCaptchaV3Provider, AppCheck } from 'firebase/app-check';

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

// Check if we're in development mode
const isDevelopment = import.meta.env.MODE === 'development' || 
                     window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1';

// Flag to enable/disable emulator usage
export const useEmulators = isDevelopment;

// Basic validation
const isFirebaseConfigValid = firebaseConfig.projectId && firebaseConfig.apiKey && firebaseConfig.appId;

// Initialize variables
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;
let analytics: Analytics | null = null;
let appCheck: AppCheck | null = null;

if (isFirebaseConfigValid) {
  console.log('Firebase config loaded: SUCCESS');
  console.log('Initializing Firebase App...');
  app = initializeApp(firebaseConfig);
  console.log('Firebase App initialized.');

  // Set up debug token for local development
  if (useEmulators) {
    // IMPORTANT: Set the debug token flag *before* initializing App Check
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
    console.log('App Check debug token flag set for localhost.');
  }

  // Initialize App Check only if site key is provided and we're not in emulator mode
  if (!useEmulators && recaptchaSiteKey) {
    console.log('Initializing App Check...');
    try {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true
      });
      console.log(`Firebase App Check initialized successfully with reCAPTCHA v3 provider (Production mode).`);
    } catch (e) {
      console.error('Failed to initialize Firebase App Check:', e);
    }
  } else if (useEmulators) {
    // When using emulators, rely on the debug token flag set above.
    console.log("Skipping explicit App Check initialization in emulator mode; relying on debug token flag.");
  } else if (!recaptchaSiteKey) {
    console.warn('VITE_RECAPTCHA_SITE_KEY is not defined in environment variables. App Check will not be initialized.');
  }

  // Initialize Firebase services if app is initialized
  try {
    auth = getAuth(app);
    console.log('Firebase Auth initialized.');
  } catch (e) { 
    console.error('Failed to initialize Firebase Auth:', e); 
    auth = null;
  }

  try {
    db = getFirestore(app);
    console.log('Firebase Firestore initialized.');
  } catch (e) { 
    console.error('Failed to initialize Firebase Firestore:', e);
    db = null;
  }

  try {
    const functionsRegion = 'us-central1'; // Hardcoded region based on firebase.json
    functions = getFunctions(app, functionsRegion);
    console.log(`Firebase Functions service initialized for region ${functionsRegion}.`);
  } catch (e) { 
    console.error('Failed to initialize Firebase Functions:', e);
    functions = null;
  }

  try {
    if (firebaseConfig.measurementId) {
       analytics = getAnalytics(app);
       console.log('Firebase Analytics initialized.');
    } else {
        console.warn('Firebase Measurement ID is not defined. Analytics will not be initialized.');
    }
  } catch (e) { 
    console.error('Failed to initialize Firebase Analytics:', e);
    analytics = null;
  }

  console.log(`Firebase initialized successfully (${import.meta.env.MODE === 'development' ? 'development' : 'production'} mode)`);

} else {
  console.error('Firebase config is missing required environment variables (Project ID, API Key, or App ID).');
}

// Export the initialized app and services
export const firebaseApp = app;
export const firebaseAuth = auth;
export const firebaseFirestore = db;
export const firebaseFunctions = functions;
export const firebaseAnalytics = analytics;
export const firebaseAppCheck = appCheck;

// Note: Emulator connection logic should happen in your firebaseService.ts
// based on window.location.hostname or import.meta.env.MODE