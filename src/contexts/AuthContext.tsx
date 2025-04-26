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

  // Memoize playAsGuest
  const playAsGuest = useCallback(async (): Promise<void> => {
    if (!auth) {
      console.error('Auth Service not available for playAsGuest.');
      throw new Error('Authentication service is not available');
    }
    if (auth.currentUser) {
      console.log('User already authenticated, skipping guest sign-in.');
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
      localStorage.setItem('authPreference', 'guest');
    } catch (error) {
      console.error('Anonymous sign-in failed:', error);
      setIsLoading(false);
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!auth) {
      console.error("Auth service not initialized. Cannot set up listener.");
      setIsLoading(false);
      return;
    }

    console.log("Setting up onAuthStateChanged listener...");
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("Auth State Changed:", user ? `User UID: ${user.uid}, Anonymous: ${user.isAnonymous}` : "No user");
      setCurrentUser(user);

      if (user) {
        setIsAuthenticated(true);
        setIsGuest(user.isAnonymous);
        setIsLoading(false); // Auth state determined
        if (!user.isAnonymous) {
           localStorage.setItem('authPreference', 'user');
        }
        // *** Data fetching is now triggered in AuthenticatedApp ***
      } else {
        setIsAuthenticated(false);
        setIsGuest(false);
        console.log("No user found, attempting guest sign-in...");
        playAsGuest().catch(err => {
            console.error("Failed to automatically sign in as guest:", err);
            setIsLoading(false); // Stop loading even if guest sign-in fails
        });
        // *** Data fetching will be triggered in AuthenticatedApp after guest sign-in completes (or fails) ***
      }
    });

    return () => {
      console.log("Cleaning up onAuthStateChanged listener.");
      unsubscribe();
    };
  }, [playAsGuest]); // Removed fetchAndCacheData dependency

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

  const signUp = async (email: string, password: string): Promise<User> => {
      if (!auth) throw new Error('Authentication service is not available');
      const currentAuthUser = auth.currentUser;
      try {
          if (currentAuthUser && currentAuthUser.isAnonymous) {
              console.log(`Attempting to link anonymous user (${currentAuthUser.uid}) with email: ${email}`);
              const credential = EmailAuthProvider.credential(email, password);
              const userCredential = await linkWithCredential(currentAuthUser, credential);
              console.log(`Successfully linked anonymous user. UID remains: ${userCredential.user.uid}`);
              localStorage.setItem('authPreference', 'user');
              return userCredential.user;
          } else {
              console.log(`No anonymous user detected or user not anonymous, creating new user with email: ${email}`);
              const userCredential = await createUserWithEmailAndPassword(auth, email, password);
              console.log(`Successfully created new user: ${userCredential.user.uid}`);
              localStorage.setItem('authPreference', 'user');
              return userCredential.user;
          }
      } catch (error: any) {
          console.error("Sign Up Error:", error);
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