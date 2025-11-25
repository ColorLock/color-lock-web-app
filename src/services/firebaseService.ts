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
import { GameStatistics } from '../types/stats';

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

// Define callable function for recording completed puzzle history
export const recordPuzzleHistoryCallable = getCallableFunction<any, { success: boolean; error?: string }>('recordPuzzleHistory');

// V2 daily scores per-difficulty stats
interface GetDailyScoresV2StatsResponse {
  success: boolean;
  stats?: Record<string, { lowestScore: number | null; totalPlayers: number; playersWithLowestScore: number; averageScore: number | null }>;
  error?: string;
}

export const getDailyScoresV2StatsCallable = getCallableFunction<{ puzzleId: string }, GetDailyScoresV2StatsResponse>('getDailyScoresV2Stats');

// Win Modal stats callable
interface GetWinModalStatsResponse {
  success: boolean;
  stats?: {
    totalAttempts: number | null;
    currentPuzzleCompletedStreak: number | null;
    currentTieBotStreak: number | null;
    currentFirstTryStreak: number | null;
    difficulty: string;
  };
  error?: string;
}

export const getWinModalStatsCallable = getCallableFunction<{ puzzleId: string; difficulty: string }, GetWinModalStatsResponse>('getWinModalStats');

// Personal Stats for Stats Modal callable
interface GetPersonalStatsResponse {
  success: boolean;
  stats?: {
    today: {
      bestEloScore: number | null;
      totalAttempts: number | null;
      fewestMoves: number | null;
      bestDifficultyEloScore: number | null;
      attemptsToTieGoal: number | null;
      attemptsToBeatGoal: number | null;
    };
    allTime: {
      currentPuzzleStreak: number | null;
      currentGoalStreak: number | null;
      currentFirstTryStreak: number | null;
      gamesPlayed: number | null;
      puzzlesSolved: number | null;
      totalMoves: number | null;
    };
    difficulty: string;
  };
  error?: string;
}

export const getPersonalStatsCallable = getCallableFunction<{ puzzleId: string; difficulty: string }, GetPersonalStatsResponse>('getPersonalStats');

// Global Leaderboard V2 callable
export interface LeaderboardEntryV2 {
  userId: string;
  username: string;
  value: number;
  rank: number;
  isCurrent?: boolean;
}

export interface GetGlobalLeaderboardV2Response {
  success: boolean;
  leaderboard?: LeaderboardEntryV2[];
  requesterEntry?: LeaderboardEntryV2;
  error?: string;
}

export const getGlobalLeaderboardV2Callable = getCallableFunction<{ 
  category: 'score' | 'goals' | 'streaks'; 
  subcategory: string; 
  difficulty?: string 
}, GetGlobalLeaderboardV2Response>('getGlobalLeaderboardV2');

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