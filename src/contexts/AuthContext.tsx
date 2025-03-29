import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
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

  // Sign up with email and password
  const signUp = async (email: string, password: string): Promise<User> => {
    if (!auth) {
      throw new Error('Authentication service is not available');
    }
    
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      setCurrentUser(userCredential.user);
      setIsAuthenticated(true);
      setIsGuest(false);
      localStorage.setItem('authPreference', 'user');
      return userCredential.user;
    } catch (error) {
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
      throw new Error('Authentication service is not available');
    }
    
    try {
      // Only sign in anonymously if we're not already authenticated
      if (!isAuthenticated) {
        await signInAnonymously(auth);
      }
      setIsGuest(true);
      setIsAuthenticated(true);
      localStorage.setItem('authPreference', 'guest');
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