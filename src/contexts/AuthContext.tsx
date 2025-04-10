import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

  // Check for stored auth preference
  useEffect(() => {
    const checkStoredPreference = () => {
      const storedPreference = localStorage.getItem('authPreference');
      
      if (storedPreference === 'guest') {
        playAsGuest();
      }
    };
    
    let unsubscribe = () => {};
    
    if (auth) {
      unsubscribe = onAuthStateChanged(auth, (user) => {
        console.log("Auth State Changed:", user ? `User UID: ${user.uid}, Anonymous: ${user.isAnonymous}` : "No user");
        setCurrentUser(user);
        
        if (user) {
          // User is signed in
          setIsAuthenticated(true);
          setIsGuest(user.isAnonymous);
        } else {
          // User is signed out - check if we should use guest mode
          checkStoredPreference();
        }
        
        setIsLoading(false);
      });
    } else {
      // If auth is not available, just set loading to false
      setIsLoading(false);
    }

    return unsubscribe;
  }, []);

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
    if (!auth) {
      throw new Error('Authentication service is not available');
    }
    
    // Get the currently signed-in user *at this moment*
    const currentAuthUser = auth.currentUser;

    try {
      // Check if the current user exists and is anonymous
      if (currentAuthUser && currentAuthUser.isAnonymous) {
        console.log(`Attempting to link anonymous user (${currentAuthUser.uid}) with email: ${email}`);
        // Create the email/password credential
        const credential = EmailAuthProvider.credential(email, password);

        // Link the credential to the existing anonymous user account
        // This upgrades the anonymous account, preserving the UID
        const userCredential = await linkWithCredential(currentAuthUser, credential);
        console.log(`Successfully linked anonymous user. UID remains: ${userCredential.user.uid}`);

        // Update local state
        setCurrentUser(userCredential.user);
        setIsAuthenticated(true);
        setIsGuest(false);
        localStorage.setItem('authPreference', 'user');

        return userCredential.user;
      } else {
        // No user is signed in, or the signed-in user is not anonymous
        // Proceed with creating a completely new user account
        console.log(`No anonymous user detected or user not anonymous, creating new user with email: ${email}`);
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log(`Successfully created new user: ${userCredential.user.uid}`);
        
        setCurrentUser(userCredential.user);
        setIsAuthenticated(true);
        setIsGuest(false);
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

  // Play as guest
  const playAsGuest = async (): Promise<void> => {
    if (!auth) {
      console.error('Authentication service not available');
      throw new Error('Authentication service is not available');
    }
    
    try {
      console.log('Play as guest: Starting authentication flow');
      // Only sign in anonymously if we're not already authenticated
      if (!isAuthenticated) {
        console.log('Play as guest: Not authenticated, attempting anonymous sign-in');
        // Add timeout to prevent indefinite waiting on auth
        const signInPromise = signInAnonymously(auth);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Anonymous sign-in timed out after 10 seconds')), 10000)
        );
        
        try {
          // Race the sign-in against the timeout
          await Promise.race([signInPromise, timeoutPromise]);
          console.log('Play as guest: Anonymous sign-in successful');
        } catch (signInError) {
          console.error('Play as guest: Anonymous sign-in failed', signInError);
          throw signInError;
        }
      } else {
        console.log('Play as guest: Already authenticated, skipping sign-in');
      }
      
      console.log('Play as guest: Setting auth state to guest');
      setIsGuest(true);
      setIsAuthenticated(true);
      localStorage.setItem('authPreference', 'guest');
      console.log('Play as guest: Flow completed successfully');
    } catch (error) {
      console.error('Play as guest: Fatal error:', error);
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