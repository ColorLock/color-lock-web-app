import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, User, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, Functions } from 'firebase/functions';
// Import AppCheck types but we'll make it optional
import { AppCheck } from 'firebase/app-check';
import { FirestorePuzzleData } from '../types';
// Import the Firebase configuration
import firebaseConfig from '../env/firebaseConfig';

// Initialize Firebase with error handling
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development' || 
                      window.location.hostname === 'localhost';

// Flag to enable/disable emulator usage
const useEmulators = isDevelopment;

try {
  // Initialize Firebase app
  app = initializeApp(firebaseConfig);
  
  // IMPORTANT: Initialize Auth FIRST before any other Firebase service
  auth = getAuth(app);
  
  // Only after Auth is initialized, initialize Firestore
  db = getFirestore(app);
  
  // Initialize Functions
  functions = getFunctions(app);
  
  // Connect to emulators if in development
  if (useEmulators) {
    console.log("Connecting to Firebase emulators");
    connectAuthEmulator(auth, "http://localhost:9099");
    connectFirestoreEmulator(db, "localhost", 8080);
    
    // Ensure Functions connection uses correct project and region for emulator
    const projectId = firebaseConfig.projectId || 'color-lock-prod';
    const region = 'us-central1'; // Match your function deployment region
    
    // Re-initialize functions with the correct region for consistency
    functions = getFunctions(app, region);
    // Connect to emulator
    connectFunctionsEmulator(functions, "localhost", 5001);
    console.log(`Functions emulator connected: http://localhost:5001 for project ${projectId} in region ${region}`);
  }
  
  console.log("Firebase initialized successfully", isDevelopment ? "(development mode)" : "(production mode)");
} catch (error) {
  console.error("Firebase initialization error:", error);
  // Create placeholders if initialization fails
  app = null;
  auth = null;
  db = null;
  functions = null;
}

export { auth, db, functions, useEmulators };

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
      const timeoutPromise = new Promise<null>((resolve, reject) => {
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
    
    console.log("User already authenticated");
    return auth.currentUser;
  } catch (error) {
    console.error("Error in ensureAuthenticated:", error);
    
    // Even if we hit an error, check if we have a user (race condition)
    if (auth?.currentUser) {
      console.warn("Found user despite error in ensureAuthenticated");
      return auth.currentUser;
    }
    
    return null;
  }
};

// Function to fetch puzzle from the HTTP Cloud Function
export const fetchPuzzleFromCloudFunction = async (date: string): Promise<FirestorePuzzleData> => {
  console.log(`Attempting to fetch puzzle for date: ${date} from Cloud Function`);
  
  // Ensure authentication to get ID token
  const user = await ensureAuthenticated();
  if (!user) {
    console.error("Authentication failed - no user available");
    throw new Error("Authentication required to call Cloud Function");
  }
  
  // Get ID token for authorization with timeout protection
  let idToken: string;
  try {
    const tokenPromise = user.getIdToken();
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Getting ID token timed out after 5 seconds")), 5000)
    );
    
    idToken = await Promise.race([tokenPromise, timeoutPromise]);
  } catch (tokenError) {
    console.error("Failed to get ID token:", tokenError);
    
    // In development/emulator environment, allow an empty token as a fallback
    if (process.env.NODE_ENV === 'development' || 
        window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1') {
      console.warn("In development environment - proceeding with empty token");
      idToken = "emulator-bypass-token";
    } else {
      throw new Error("Failed to get authentication token");
    }
  }
  
  // Determine the correct function URL
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  // IMPORTANT: Ensure project ID and region match emulator/deployment
  const projectId = firebaseConfig.projectId || 'color-lock-prod'; // Get from config or default
  const region = 'us-central1'; // Assuming us-central1

  let functionUrl: string;
  if (isLocalDev && useEmulators) {
    // Use direct emulator URL when running locally with emulators
    // Ensure the port (5001) matches your firebase.json emulator config
    functionUrl = `http://localhost:5001/${projectId}/${region}/fetchPuzzle`;
    console.log(`Using Emulator URL: ${functionUrl}`);
  } else {
    // Use production URL otherwise
    functionUrl = `https://${region}-${projectId}.cloudfunctions.net/fetchPuzzle`;
    console.log(`Using Production URL: ${functionUrl}`);
  }
  
  try {
    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Add authorization header if we have a token
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }
    
    // For emulator use, add X-Emulator-User-Id header as fallback
    if (isLocalDev && useEmulators && user.uid) {
      headers['X-Emulator-User-Id'] = user.uid;
    }
    
    // Call the HTTP function directly
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ date })
    });
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`HTTP error: ${response.status} - ${response.statusText}`, errorBody);
      throw new Error(`Failed to fetch puzzle (${response.status}): ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      console.log("Successfully retrieved puzzle from Cloud Function");
      // Perform basic validation on received data
      if (!data.data || !data.data.algoScore || !data.data.targetColor || !data.data.states || !Array.isArray(data.data.states) || data.data.states.length === 0) {
        console.error("Invalid data format received from Cloud Function:", data.data);
        throw new Error("Invalid puzzle data format received from function.");
      }
      return data.data as FirestorePuzzleData;
    } else {
      console.error("Error from Cloud Function:", data.error);
      throw new Error(`Cloud Function error: ${data.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error("Error calling fetchPuzzle Cloud Function:", error);
    // Re-throw the error to be handled by the caller (e.g., GameContext)
    throw error;
  }
};

// Main puzzle fetch function - now ONLY uses cloud function
export const fetchPuzzle = async (date: string): Promise<FirestorePuzzleData> => {
  // Always use the Cloud Function
  return await fetchPuzzleFromCloudFunction(date);
};

export default app; 