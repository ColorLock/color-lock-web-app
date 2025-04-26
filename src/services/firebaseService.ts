import { 
  connectAuthEmulator, 
  signInAnonymously, 
  User, 
  getIdToken,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  connectFirestoreEmulator 
} from 'firebase/firestore';
import { 
  connectFunctionsEmulator, 
  httpsCallable 
} from 'firebase/functions';
import { 
  logEvent 
} from 'firebase/analytics';

// Import Firebase services from centralized config
import { 
  firebaseApp,
  firebaseAuth, 
  firebaseFirestore, 
  firebaseFunctions, 
  firebaseAnalytics,
  firebaseAppCheck,
  useEmulators
} from '../env/firebaseConfig';

// Import types
import { FirestorePuzzleData } from '../types';
import { GameStatistics, LeaderboardEntry } from '../types/stats';

// Connect to emulators if in development
if (useEmulators && firebaseAuth && firebaseFirestore && firebaseFunctions) {
  console.log("[FirebaseService] Connecting to Emulators...");
  try {
    connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", { disableWarnings: true });
    console.log("[FirebaseService] Connected to Auth emulator (127.0.0.1:9099)");

    connectFirestoreEmulator(firebaseFirestore, "localhost", 8080);
    console.log("[FirebaseService] Connected to Firestore emulator (localhost:8080)");

    console.log("[FirebaseService] Connecting to Functions emulator...");
    try {
      connectFunctionsEmulator(firebaseFunctions, "localhost", 5001);
      console.log("[FirebaseService] Connected to Functions emulator (localhost:5001)");
    } catch (e) { 
      console.error("[FirebaseService] Failed to connect to Functions emulator:", e); 
    }
  } catch (e) {
    console.error("[FirebaseService] Failed to connect to emulators:", e);
  }
}

// Export the services for use throughout the application
export { 
  firebaseAuth as auth, 
  firebaseFirestore as db, 
  firebaseFunctions as functions, 
  firebaseAnalytics as analytics,
  firebaseAppCheck as appCheck,
  useEmulators 
};

// Helper function for callables
const getCallableFunction = <RequestData, ResponseData>(name: string) => {
  console.log(`[FirebaseService] Creating callable function reference for: ${name}`);
  if (!firebaseFunctions) {
    console.error(`[FirebaseService] Firebase Functions is not initialized. Cannot create callable function: ${name}`);
    return () => { throw new Error(`Firebase Functions not initialized. Cannot call function: ${name}`); };
  }
  console.log(`[FirebaseService] Using functions instance:`, firebaseFunctions);
  try {
    const callable = httpsCallable<RequestData, ResponseData>(firebaseFunctions, name);
    console.log(`[FirebaseService] Successfully created callable reference for: ${name}`);
    return callable;
  } catch (error) {
    console.error(`[FirebaseService] Error creating callable function ${name}:`, error);
    throw error;
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

// Add a helper function to verify auth state - useful for debugging
export const verifyAuthState = () => {
  if (!firebaseAuth) {
    console.error("[FirebaseService] Auth service not initialized");
    return Promise.resolve(null);
  }
  
  const currentUser = firebaseAuth.currentUser;
  console.log("[FirebaseService] Current auth state:", {
    user: currentUser ? {
      uid: currentUser.uid,
      isAnonymous: currentUser.isAnonymous,
      displayName: currentUser.displayName,
      email: currentUser.email,
      emailVerified: currentUser.emailVerified,
      providerId: currentUser.providerId,
      providerData: currentUser.providerData
    } : null
  });
  
  return Promise.resolve(currentUser);
};

// Export the Firebase app instance as default
export default firebaseApp; 