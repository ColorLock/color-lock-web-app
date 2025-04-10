/**
 * Utility functions for debugging Firebase connections and emulator setup
 */

import { auth, db, functions, useEmulators } from './firebaseService';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc } from 'firebase/firestore';

/**
 * Display Firebase connection information in the console
 * Useful for debugging connection issues with emulators
 */
export const logFirebaseConnectionInfo = (): void => {
  console.group('Firebase Connection Information');
  console.log('Firebase initialized:', !!getApp());
  console.log('Auth initialized:', !!auth);
  console.log('Firestore initialized:', !!db);
  console.log('Functions initialized:', !!functions);
  console.log('Using emulators:', useEmulators);
  console.log('Current user:', auth?.currentUser?.uid || 'Not signed in');
  console.groupEnd();
};

/**
 * Test a call to the getDailyScoresStats function
 * Returns the result or error information
 */
export const testGetDailyScoresStats = async (date?: string): Promise<any> => {
  try {
    const functionRef = getFunctions(getApp());
    const getDailyScoresStatsFunc = httpsCallable(functionRef, 'getDailyScoresStats');
    
    // Use today's date if none provided
    const puzzleId = date || new Date().toISOString().split('T')[0];
    
    console.log(`Testing getDailyScoresStats with puzzleId: ${puzzleId}`);
    const result = await getDailyScoresStatsFunc({ puzzleId });
    
    console.log('Function call successful!');
    console.log('Result:', result.data);
    return result.data;
  } catch (error) {
    console.error('Function call failed:', error);
    return { success: false, error };
  }
};

/**
 * Directly check if Firestore has a document
 * Useful for verifying if test data was seeded correctly
 */
export const checkFirestoreDocument = async (collectionName: string, documentId: string): Promise<any> => {
  try {
    if (!db) {
      console.error('Firestore not initialized');
      return null;
    }
    
    console.log(`Checking for document ${collectionName}/${documentId}`);
    const docRef = doc(db, collectionName, documentId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      console.log('Document exists:', docSnap.data());
      return docSnap.data();
    } else {
      console.log('Document does not exist');
      return null;
    }
  } catch (error) {
    console.error('Error checking document:', error);
    return null;
  }
};

// Export a window method for testing in browser console
if (typeof window !== 'undefined') {
  (window as any).testFirebase = {
    logConnectionInfo: logFirebaseConnectionInfo,
    testFunction: testGetDailyScoresStats,
    checkDocument: checkFirestoreDocument
  };
} 