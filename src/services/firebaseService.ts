import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, User, Auth } from 'firebase/auth';
import { getFirestore, doc, getDoc, Firestore } from 'firebase/firestore';
// Import AppCheck types but we'll make it optional
import { AppCheck } from 'firebase/app-check';
import { FirestorePuzzleData } from '../types';
// Import the Firebase configuration
import firebaseConfig from '../env/firebaseConfig';

// Initialize Firebase with error handling
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

try {
  // Initialize Firebase app
  app = initializeApp(firebaseConfig);
  
  // IMPORTANT: Initialize Auth FIRST before any other Firebase service
  auth = getAuth(app);
  
  // Only after Auth is initialized, initialize Firestore
  db = getFirestore(app);
  
  console.log("Firebase initialized successfully");
} catch (error) {
  console.error("Firebase initialization error:", error);
  // Create placeholders if initialization fails
  app = null;
  auth = null;
  db = null;
}

export { auth, db };

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
      try {
        const userCredential = await signInAnonymously(auth);
        console.log("Anonymous sign-in successful");
        return userCredential.user;
      } catch (error) {
        console.error("Anonymous authentication error:", error);
        // Return null instead of throwing to allow graceful fallback
        return null;
      }
    }
    console.log("User already authenticated");
    return auth.currentUser;
  } catch (error) {
    console.error("Error in ensureAuthenticated:", error);
    return null;
  }
};

// Function to fetch puzzle from the HTTP Cloud Function
export const fetchPuzzleFromCloudFunction = async (date: string): Promise<FirestorePuzzleData> => {
  console.log(`Attempting to fetch puzzle for date: ${date} from Cloud Function`);
  
  // Ensure authentication to get ID token
  const user = await ensureAuthenticated();
  if (!user) {
    throw new Error("Authentication required to call Cloud Function");
  }
  
  // Get ID token for authorization
  const idToken = await user.getIdToken();
  
  // Configure the cloud function URL
  const isLocalDev = window.location.hostname === 'localhost';
  
  // Use the proxy URL in development, direct URL in production
  let functionUrl = isLocalDev
    ? '/api/fetch_puzzle' // This is handled by the Vite proxy
    : 'https://us-central1-color-lock-prod.cloudfunctions.net/fetch_puzzle';
  
  try {
    // Call the HTTP function directly
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}` // Authentication token
      },
      body: JSON.stringify({ date })
    });
    
    if (!response.ok) {
      console.error(`HTTP error: ${response.status}`);
      throw new Error(`Failed to fetch puzzle: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      console.log("Successfully retrieved puzzle from Cloud Function");
      return data.data as FirestorePuzzleData;
    } else {
      console.error("Error from Cloud Function:", data.error);
      throw new Error(`Cloud Function error: ${data.error}`);
    }
  } catch (error) {
    console.error("Error calling Cloud Function:", error);
    throw error;
  }
};

// Function to fetch puzzle from Firestore with better fallback
export const fetchPuzzleFromFirestore = async (date: string): Promise<FirestorePuzzleData> => {
  console.log(`Attempting to fetch puzzle for date: ${date}`);
  
  try {
    // Try to authenticate, but continue even if it fails
    const user = await ensureAuthenticated();
    console.log("Authentication status:", user ? "Authenticated" : "Not authenticated");
    
    if (user && db) { // Check that db is not null
      try {
        console.log("Attempting to fetch puzzle from Firestore");
        const puzzleRef = doc(db, 'puzzles', date);
        const puzzleSnap = await getDoc(puzzleRef);
        
        if (puzzleSnap.exists()) {
          console.log("Puzzle found in Firestore");
          const data = puzzleSnap.data();
          
          // Log the raw data to see its structure
          console.log("Raw Firestore data:", data);
          
          // Validate the data has required properties with updated structure
          if (!data.algoScore || !data.targetColor || !data.states || !Array.isArray(data.states)) {
            console.error("Missing required fields:", { 
              hasAlgoScore: !!data.algoScore, 
              hasTargetColor: !!data.targetColor, 
              hasStates: !!data.states,
              statesIsArray: Array.isArray(data.states)
            });
            throw new Error("Invalid puzzle data format");
          }
          
          // Additional validation for states
          if (data.states.length === 0) {
            console.error("States array is empty");
            throw new Error("Invalid puzzle data format - empty states");
          }
          
          return data as FirestorePuzzleData;
        } else {
          console.log("No puzzle found in Firestore for date:", date);
          throw new Error("No puzzle found for date: " + date);
        }
      } catch (firestoreError) {
        console.error("Firestore access error:", firestoreError);
        throw new Error("Firestore access failed, falling back to local generation");
      }
    } else {
      // Handle the case where db or auth is null
      console.error("Firebase not initialized or user not authenticated");
      throw new Error("Firebase not initialized or authentication failed");
    }
    
    // If we get here, we need to fall back to local generation
    console.log("Falling back to local puzzle generation");
    throw new Error("Firestore access failed, falling back to local generation");
    
  } catch (error) {
    console.error("Error in fetchPuzzleFromFirestore:", error);
    throw error;
  }
};

// Main puzzle fetch function - tries cloud function first, then falls back to direct Firestore
export const fetchPuzzle = async (date: string): Promise<FirestorePuzzleData> => {
  try {
    // First try the Cloud Function
    return await fetchPuzzleFromCloudFunction(date);
  } catch (error) {
    console.warn("Cloud Function fetch failed, falling back to direct Firestore:", error);
    
    // Fall back to directly accessing Firestore
    return await fetchPuzzleFromFirestore(date);
  }
};

export default app; 