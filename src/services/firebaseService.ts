import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, User, Auth, connectAuthEmulator, getIdToken } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, Functions, httpsCallable } from 'firebase/functions';
// Import AppCheck types and ReCaptchaV3Provider
import { initializeAppCheck, ReCaptchaV3Provider, AppCheck } from 'firebase/app-check';
// Import FirestorePuzzleData from the main types index file
import { FirestorePuzzleData } from '../types';
// Change default import to a direct object definition
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
};
import { Analytics, getAnalytics, logEvent } from 'firebase/analytics';
// GameStatistics and LeaderboardEntry come from stats.ts
import { GameStatistics, LeaderboardEntry } from '../types/stats';

// Initialize Firebase with error handling
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;
let analytics: Analytics | null = null;
let appCheck: AppCheck | null = null; // Add AppCheck instance

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development' ||
                      window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1'; // Added 127.0.0.1

// Flag to enable/disable emulator usage
const useEmulators = isDevelopment;

// --- App Check Debug Token (Development ONLY) ---
if (useEmulators) {
  // IMPORTANT: Set the debug token flag *before* initializing App Check
  (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  console.warn("App Check debug token generation enabled for emulator testing. Ensure this is not active in production.");
  console.log("To get the debug token, check the console logs for a message starting with 'App Check debug token:'");
}
// --- End App Check Debug Token ---

try {
  // Initialize Firebase app
  app = initializeApp(firebaseConfig);
  console.log("Firebase App initialized.");

  // --- Initialize App Check ---
  if (app) { // Ensure app is initialized before using it
    // --- REVISED LOGIC START ---
    if (!useEmulators && import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
      // Only initialize with ReCaptcha if NOT using emulators AND site key exists
      try {
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
          isTokenAutoRefreshEnabled: true
        });
        console.log("Firebase App Check initialized successfully with reCAPTCHA v3 provider (Production mode).");
      } catch (appCheckError) {
        console.error("Firebase App Check (Production) initialization error:", appCheckError);
      }
    } else if (useEmulators) {
      // When using emulators, rely on the debug token flag set above.
      // Explicit initialization might interfere or cause errors if provider is incorrect/missing.
      console.log("Skipping explicit App Check initialization in emulator mode; relying on debug token flag.");
      // No explicit appCheck = initializeAppCheck(...) call here for emulators.
    } else if (!useEmulators && !import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
      // Not using emulators, but no site key provided.
      console.warn("VITE_RECAPTCHA_SITE_KEY is not set. App Check initialization skipped. This is required for production.");
    }
    // --- REVISED LOGIC END ---
  }
  // --- End App Check Initialization ---

  // IMPORTANT: Initialize Auth FIRST before any other Firebase service
  auth = getAuth(app);
  console.log("Firebase Auth initialized.");

  // Only after Auth is initialized, initialize Firestore
  db = getFirestore(app);
  console.log("Firebase Firestore initialized.");

  // Initialize Functions
  functions = getFunctions(app, 'us-central1'); // Specify region
  console.log("[FirebaseService] Firebase Functions service initialized for region us-central1."); // Log init

  // Connect to emulators if in development
  if (useEmulators) {
      console.log("[FirebaseService] Connecting to Emulators...");
      try {
          connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
          console.log("[FirebaseService] Connected to Auth emulator (127.0.0.1:9099)");

          connectFirestoreEmulator(db, "localhost", 8080);
          console.log("[FirebaseService] Connected to Firestore emulator (localhost:8080)");

          if (functions) {
              console.log("[FirebaseService] Connecting to Functions emulator...");
              try {
                  connectFunctionsEmulator(functions, "localhost", 5001);
                  console.log("[FirebaseService] Connected to Functions emulator (localhost:5001)"); // Log connection
              } catch (e) { console.error("[FirebaseService] Failed to connect to Functions emulator:", e); }
          }
      } catch (e) {
          console.error("[FirebaseService] Failed to connect to emulators:", e);
      }
  }

  console.log("[FirebaseService] Firebase initialized successfully", useEmulators ? "(development mode with emulators)" : "(production mode)");

  // Initialize Analytics
  analytics = getAnalytics(app);
  console.log("Firebase Analytics initialized.");

} catch (error) {
  console.error("Firebase core initialization error:", error);
  app = null;
  auth = null;
  db = null;
  functions = null;
  appCheck = null;
  analytics = null;
}

export { auth, db, functions, useEmulators, appCheck, analytics };

// Helper function for callables
const getCallableFunction = <RequestData, ResponseData>(name: string) => {
    console.log(`[FirebaseService] Creating callable function reference for: ${name}`); // Log creation attempt
    if (!functions) {
        console.error(`[FirebaseService] Firebase Functions is not initialized. Cannot create callable function: ${name}`);
        return () => { throw new Error(`Firebase Functions not initialized. Cannot call function: ${name}`); };
    }
    console.log(`[FirebaseService] Using functions instance:`, functions); // Log the instance being used
    try {
        const callable = httpsCallable<RequestData, ResponseData>(functions, name);
        console.log(`[FirebaseService] Successfully created callable reference for: ${name}`);
        return callable;
    } catch (error) {
        console.error(`[FirebaseService] Error creating callable function ${name}:`, error);
        throw error; // Re-throw error
    }
};

// Define callable function for fetching puzzle
export const fetchPuzzleCallable = getCallableFunction<{ date: string }, { success: boolean; data?: FirestorePuzzleData; error?: string }>('fetchPuzzle');

// Define callable function for updating stats
export const updateUserStatsCallable = getCallableFunction<any, { success: boolean; updatedStats?: any; error?: string }>('updateUserStats');

// Define callable function for getting user stats
export const getUserStatsCallable = getCallableFunction<void, { success: boolean; stats?: any; error?: string }>('getUserStats');

// Define callable function for getting daily score stats
export const getDailyScoresStatsCallable = getCallableFunction<{ puzzleId: string }, { success: boolean; stats?: any; error?: string }>('getDailyScoresStats');

// Define callable function for getting global leaderboard
interface GetGlobalLeaderboardResponse {
  success: boolean;
  leaderboard?: LeaderboardEntry[];
  error?: string;
}

export const getGlobalLeaderboardCallable = getCallableFunction<void, GetGlobalLeaderboardResponse>('getGlobalLeaderboard');

// --- End httpsCallable functions ---

export default app; 