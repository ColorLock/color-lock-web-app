import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, User, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, Functions, httpsCallable } from 'firebase/functions';
// Import AppCheck types and provider
import { initializeAppCheck, ReCaptchaV3Provider, AppCheck } from 'firebase/app-check';
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
// Assign the debug token to a global variable for easy access in the console
// DO NOT use this in production.
if (isDevelopment) {
  (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true; // Enable debug token generation
  console.warn("App Check debug token generation enabled. Ensure this is not active in production.");
  console.log("To get the debug token, check the console logs for a message starting with 'App Check debug token:'");
}
// --- End App Check Debug Token ---

try {
  // Initialize Firebase app
  app = initializeApp(firebaseConfig);

  // --- Initialize App Check ---
  // Ensure the site key is available
  if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
      // Optional argument. If true, the SDK automatically refreshes App Check
      // tokens as needed. Recommended for SPAs.
      isTokenAutoRefreshEnabled: true
    });
    console.log("Firebase App Check initialized successfully.");
  } else {
    console.error("VITE_RECAPTCHA_SITE_KEY is not set. App Check initialization skipped.");
  }
  // --- End App Check Initialization ---

  // IMPORTANT: Initialize Auth FIRST before any other Firebase service
  auth = getAuth(app);

  // Only after Auth is initialized, initialize Firestore
  db = getFirestore(app);

  // Initialize Functions
  functions = getFunctions(app, 'us-central1'); // Specify region

  // Connect to emulators if in development
  if (useEmulators) {
    console.log("Connecting to Firebase emulators");
    // Note: App Check emulator connection is not typically needed for client-side testing
    // unless you are testing custom App Check providers. reCAPTCHA v3 works against the real service.
    connectAuthEmulator(auth, "http://localhost:9099");
    connectFirestoreEmulator(db, "localhost", 8080);
    connectFunctionsEmulator(functions, "localhost", 5001);
    console.log(`Functions emulator connected: http://localhost:5001`);
  }

  console.log("Firebase initialized successfully", isDevelopment ? "(development mode)" : "(production mode)");
} catch (error) {
  console.error("Firebase initialization error:", error);
  // Create placeholders if initialization fails
  app = null;
  auth = null;
  db = null;
  functions = null;
  appCheck = null;
}

export { auth, db, functions, useEmulators, appCheck }; // Export appCheck

// Function to ensure user is authenticated with better error handling
export const ensureAuthenticated = async (): Promise<User | null> => {
  try {
    // Check if Firebase is properly initialized
    if (!auth) {
      console.error("Firebase Auth not initialized");
      return null;
    }

    console.log("Attempting to ensure authentication");

    if (!auth.currentUser) {
      console.log("No current user, attempting anonymous sign-in");

      // Add timeout protection to anonymous sign-in
      const signInPromise = signInAnonymously(auth).then(userCredential => {
        console.log("Anonymous sign-in successful");
        return userCredential.user;
      });

      // Create a timeout promise
      const timeoutPromise = new Promise<null>((_, reject) => { // Changed resolve to reject
        setTimeout(() => {
          console.error("Anonymous sign-in timed out after 8 seconds");
          reject(new Error("Authentication timed out"));
        }, 8000);
      });

      try {
        // Race the sign-in against the timeout
        const user = await Promise.race([signInPromise, timeoutPromise]);
        return user;
      } catch (error) {
        console.error("Anonymous authentication error:", error);

        // Check if there's a user despite the error (race condition)
        if (auth.currentUser) {
          console.warn("Found user despite authentication error");
          return auth.currentUser;
        }

        // Return null instead of throwing to allow graceful fallback
        return null;
      }
    }

    console.log("User already authenticated:", auth.currentUser.uid);

    // Force token refresh for existing users (optional, but good practice)
    try {
      console.log("Forcing ID token refresh");
      const forceRefreshPromise = auth.currentUser.getIdToken(true);
      const refreshTimeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => {
          console.error("Token refresh timed out after 5 seconds");
          reject(new Error("Token refresh timed out"));
        }, 5000);
      });

      await Promise.race([forceRefreshPromise, refreshTimeoutPromise]);
      console.log("Token refresh successful");
    } catch (refreshError) {
      console.warn("Token refresh failed, but using existing authentication:", refreshError);
      // Continue with existing user even if refresh fails
    }

    return auth.currentUser;
  } catch (error) {
    console.error("Error in ensureAuthenticated:", error);

    // Even if we hit an error, check if we have a user (race condition)
    if (auth?.currentUser) {
      console.warn("Found user despite error in ensureAuthenticated");
      return auth?.currentUser;
    }

    return null;
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