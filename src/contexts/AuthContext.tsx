import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously, EmailAuthProvider, linkWithCredential } from 'firebase/auth';
import { auth } from '../services/firebaseService';

interface AuthContextType {
  currentUser: User | null;
  isGuest: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string) => Promise<User>;
  logOut: () => Promise<void>;
  playAsGuest: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Memoize playAsGuest to avoid re-creating it unnecessarily
  const playAsGuest = useCallback(async (): Promise<void> => {
    if (!auth) {
      console.error('Auth Service not available for playAsGuest.');
      throw new Error('Authentication service is not available');
    }
    // Double-check if a user logged in while this was being called
    if (auth.currentUser) {
      console.log('User already authenticated, skipping guest sign-in.');
      // Update state just in case it was lagging
      setCurrentUser(auth.currentUser);
      setIsAuthenticated(true);
      setIsGuest(auth.currentUser.isAnonymous);
      setIsLoading(false);
      return;
    }

    console.log('Attempting anonymous sign-in...');
    try {
      const userCredential = await signInAnonymously(auth);
      console.log('Anonymous sign-in successful:', userCredential.user.uid);
      // State will be updated by onAuthStateChanged listener
      localStorage.setItem('authPreference', 'guest'); // Persist preference
    } catch (error) {
      console.error('Anonymous sign-in failed:', error);
      // Set loading to false even if guest sign-in fails, so app doesn't hang
      setIsLoading(false);
      throw error; // Re-throw error to indicate failure
    }
  }, []); // No dependencies needed as `auth` is stable

  useEffect(() => {
    if (!auth) {
      console.error("Auth service not initialized. Cannot set up listener.");
      setIsLoading(false); // Stop loading if auth isn't available
      return;
    }

    console.log("Setting up onAuthStateChanged listener...");
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("Auth State Changed:", user ? `User UID: ${user.uid}, Anonymous: ${user.isAnonymous}` : "No user");
      setCurrentUser(user);

      if (user) {
        // User is signed in (either guest or permanent)
        setIsAuthenticated(true);
        setIsGuest(user.isAnonymous);
        setIsLoading(false);
        // If it's a permanent user, ensure preference is set
        if (!user.isAnonymous) {
           localStorage.setItem('authPreference', 'user');
        }
      } else {
        // No user is signed in
        setIsAuthenticated(false);
        setIsGuest(false);

        // --- Attempt Guest Sign-in Automatically ---
        // Remove the isLoading check here. If the listener fires and finds no user,
        // we *always* want to attempt guest sign-in on the initial load sequence.
        // The listener itself implies the SDK is ready.
        console.log("No user found, attempting guest sign-in...");
        playAsGuest().catch(err => {
            console.error("Failed to automatically sign in as guest:", err);
            // Still need to stop loading indicator if guest sign-in fails
            setIsLoading(false);
        });
        // --- End Guest Sign-in Logic ---
      }
    });

    // Cleanup listener on unmount
    return () => {
      console.log("Cleaning up onAuthStateChanged listener.");
      unsubscribe();
    };
  // Remove isLoading from dependency array, as its check inside is removed.
  // Keep playAsGuest as it's used inside.
  }, [playAsGuest]);

  // Sign in with email and password
  const signIn = async (email: string, password: string): Promise<User> => {
    if (!auth) {
      throw new Error('Authentication service is not available');
    }
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setCurrentUser(userCredential.user);
      setIsAuthenticated(true);
      setIsGuest(false);
      localStorage.setItem('authPreference', 'user');
      return userCredential.user;
    } catch (error) {
      throw error;
    }
  };

  // Sign up with email and password - Updated to use account linking
  const signUp = async (email: string, password: string): Promise<User> => {
    if (!auth) throw new Error('Authentication service is not available');

    const currentAuthUser = auth.currentUser; // Check current user *at this moment*

    try {
      if (currentAuthUser && currentAuthUser.isAnonymous) {
        console.log(`Attempting to link anonymous user (${currentAuthUser.uid}) with email: ${email}`);
        const credential = EmailAuthProvider.credential(email, password);
        const userCredential = await linkWithCredential(currentAuthUser, credential);
        console.log(`Successfully linked anonymous user. UID remains: ${userCredential.user.uid}`);
        // State updates handled by onAuthStateChanged
        localStorage.setItem('authPreference', 'user');
        return userCredential.user;
      } else {
        console.log(`No anonymous user detected or user not anonymous, creating new user with email: ${email}`);
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log(`Successfully created new user: ${userCredential.user.uid}`);
        // State updates handled by onAuthStateChanged
        localStorage.setItem('authPreference', 'user');
        return userCredential.user;
      }
    } catch (error: any) {
      console.error("Sign Up Error:", error);
      
      // Handle specific error cases
      if (error.code === 'auth/credential-already-in-use') {
        throw new Error("This email address is already associated with an account. Please sign in or use a different email.");
      } else if (error.code === 'auth/email-already-in-use') {
        throw new Error("This email address is already registered. Please sign in.");
      } else if (error.code === 'auth/provider-already-linked') {
        throw new Error("This guest account is already linked to an email.");
      }
      
      throw error;
    }
  };

  // Sign out
  const logOut = async (): Promise<void> => {
    if (!auth) {
      throw new Error('Authentication service is not available');
    }
    
    try {
      await signOut(auth);
      setCurrentUser(null);
      setIsAuthenticated(false);
      setIsGuest(false);
      localStorage.removeItem('authPreference');
    } catch (error) {
      throw error;
    }
  };

  const value: AuthContextType = {
    currentUser,
    isGuest,
    isAuthenticated,
    isLoading,
    signIn,
    signUp,
    logOut,
    playAsGuest
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 