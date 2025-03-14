import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, User } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
// Import AppCheck types but we'll make it optional
import { AppCheck } from 'firebase/app-check';
import { FirestorePuzzleData } from '../types';
// Import the Firebase configuration
import firebaseConfig from '../firebase_config';

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// IMPORTANT: Initialize Auth FIRST before any other Firebase service
export const auth = getAuth(app);

// Only after Auth is initialized, initialize Firestore
export const db = getFirestore(app);

// Function to ensure user is authenticated with better error handling
export const ensureAuthenticated = async (): Promise<User | null> => {
  try {
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

// Function to fetch puzzle from Firestore with better fallback
export const fetchPuzzleFromFirestore = async (date: string): Promise<FirestorePuzzleData> => {
  console.log(`Attempting to fetch puzzle for date: ${date}`);
  
  try {
    // Try to authenticate, but continue even if it fails
    const user = await ensureAuthenticated();
    console.log("Authentication status:", user ? "Authenticated" : "Not authenticated");
    
    if (user) {
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
    }
    
    // If we get here, we need to fall back to local generation
    console.log("Falling back to local puzzle generation");
    throw new Error("Firestore access failed, falling back to local generation");
    
  } catch (error) {
    console.error("Error in fetchPuzzleFromFirestore:", error);
    throw error;
  }
};

export default app; 