import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, User, Auth, connectAuthEmulator, getIdToken } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, Functions, httpsCallable } from 'firebase/functions';
// Import AppCheck types and ReCaptchaEnterpriseProvider
import { initializeAppCheck, ReCaptchaEnterpriseProvider, AppCheck } from 'firebase/app-check';
import { FirestorePuzzleData } from '../types';
// Import the Firebase configuration
import firebaseConfig from '../env/firebaseConfig';

// Initialize Firebase with error handling
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;
let appCheck: AppCheck | null = null; // Add AppCheck instance

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development' ||
                      window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1'; // Added 127.0.0.1

// Flag to enable/disable emulator usage
const useEmulators = isDevelopment;

// --- App Check Debug Token (Development ONLY) ---
if (useEmulators) {
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
  // Ensure the site key is available (this should be your reCAPTCHA Enterprise Site Key)
  if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
    try {
        appCheck = initializeAppCheck(app, {
          // Use ReCaptchaEnterpriseProvider instead of ReCaptchaV3Provider
          provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
          isTokenAutoRefreshEnabled: true
        });
        console.log("Firebase App Check initialized successfully with reCAPTCHA Enterprise provider.");
    } catch (appCheckError) {
        console.error("Firebase App Check (Enterprise) initialization error:", appCheckError);
    }
  } else {
    console.warn("VITE_RECAPTCHA_SITE_KEY is not set. App Check initialization skipped. This is OK for emulator testing but required for production.");
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
  console.log("Firebase Functions initialized for region us-central1.");

  // Connect to emulators if in development
  if (useEmulators) {
    console.log("Connecting to Firebase emulators...");
    try {
        connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
        console.log("Connected to Auth emulator (localhost:9099)");
    } catch (e) { console.error("Failed to connect to Auth emulator:", e); }
    try {
        connectFirestoreEmulator(db, "localhost", 8080);
        console.log("Connected to Firestore emulator (localhost:8080)");
    } catch (e) { console.error("Failed to connect to Firestore emulator:", e); }
    try {
        connectFunctionsEmulator(functions, "localhost", 5001);
        console.log("Connected to Functions emulator (localhost:5001)");
    } catch (e) { console.error("Failed to connect to Functions emulator:", e); }
  }

  console.log("Firebase initialized successfully", useEmulators ? "(development mode with emulators)" : "(production mode)");

} catch (error) {
  console.error("Firebase core initialization error:", error);
  app = null;
  auth = null;
  db = null;
  functions = null;
  appCheck = null;
}

export { auth, db, functions, useEmulators, appCheck };

// Function to ensure user is authenticated with better error handling
export const ensureAuthenticated = async (): Promise<User | null> => {
  if (!auth) {
    console.error("Firebase Auth not initialized, cannot ensure authentication.");
    return null;
  }

  if (auth.currentUser) {
    console.log("User already authenticated:", auth.currentUser.uid, "Anonymous:", auth.currentUser.isAnonymous);
    try {
      await getIdToken(auth.currentUser, true); // Force refresh
      console.log("ID token refreshed silently.");
    } catch (refreshError) {
      console.warn("Silent token refresh failed:", refreshError);
    }
    return auth.currentUser;
  }

  console.log("No current user, attempting anonymous sign-in...");
  try {
    const signInPromise = signInAnonymously(auth);
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error("Anonymous sign-in timed out (8s)")), 8000)
    );

    const userCredential = await Promise.race([signInPromise, timeoutPromise as Promise<any>]);
    if (userCredential && userCredential.user) {
        console.log("Anonymous sign-in successful:", userCredential.user.uid);
        return userCredential.user;
    } else {
        console.warn("Sign-in promise resolved after timeout or returned unexpected structure.");
        return auth.currentUser;
    }
  } catch (error) {
    console.error("Anonymous sign-in error:", error);
    return auth.currentUser || null;
  }
};

// --- Define httpsCallable functions ---
const getCallableFunction = <RequestData, ResponseData>(name: string) => {
    if (!functions) {
        throw new Error("Firebase Functions is not initialized.");
    }
    return httpsCallable<RequestData, ResponseData>(functions, name);
};

// Define callable function for fetching puzzle
export const fetchPuzzleCallable = getCallableFunction<{ date: string }, { success: boolean; data?: FirestorePuzzleData; error?: string }>('fetchPuzzle');

// Define callable function for updating stats
export const updateUserStatsCallable = getCallableFunction<any, { success: boolean; updatedStats?: any; error?: string }>('updateUserStats');

// Define callable function for getting user stats
export const getUserStatsCallable = getCallableFunction<void, { success: boolean; stats?: any; error?: string }>('getUserStats');

// Define callable function for getting daily score stats
export const getDailyScoresStatsCallable = getCallableFunction<{ puzzleId: string }, { success: boolean; stats?: any; error?: string }>('getDailyScoresStats');
// --- End httpsCallable functions ---

export default app; 