/**
 * Utility functions for debugging Firebase connections and emulator setup
 */

import { auth, db, functions, useEmulators } from './firebaseService';
import { getApp } from 'firebase/app';
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
 * Now uses the API Gateway instead of httpsCallable
 */
export const testGetDailyScoresStats = async (date?: string): Promise<any> => {
  try {
    // Use today's date if none provided
    const puzzleId = date || new Date().toISOString().split('T')[0];
    
    console.log(`Testing getDailyScoresStats with puzzleId: ${puzzleId}`);
    
    if (!auth?.currentUser) {
      console.error('User not authenticated. Please sign in first.');
      return { success: false, error: 'User not authenticated' };
    }
    
    // Get the user's ID token
    const idToken = await auth.currentUser.getIdToken();
    
    // Get the API Gateway URL from environment or use local emulator
    const isLocal = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';
    let apiUrl: string;
    
    if (isLocal) {
      // Use emulator endpoint for local development
      apiUrl = 'http://localhost:5001/color-lock-prod/us-central1/getDailyScoresStatsHttp';
      console.log(`Using emulator endpoint: ${apiUrl}`);
    } else {
      // Use API Gateway in production
      const gatewayUrl = import.meta.env.VITE_API_GATEWAY_URL;
      if (!gatewayUrl) {
        throw new Error('API Gateway URL is not configured');
      }
      apiUrl = `${gatewayUrl}/getDailyScoresStats`;
      console.log(`Using API Gateway: ${apiUrl}`);
    }
    
    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }
    
    // For emulator testing
    if (isLocal && auth?.currentUser?.uid) {
      headers['X-Emulator-User-Id'] = auth.currentUser.uid;
    }
    
    // Make the fetch request
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ puzzleId }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API responded with error ${response.status}:`, errorText);
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }
    
    const result = await response.json();
    console.log('Function call successful!');
    console.log('Result:', result);
    return result;
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

// Add a function to test the API Gateway integration
export const testApiGateway = async () => {
  if (!auth?.currentUser) {
    console.error('User not authenticated. Please sign in first.');
    return;
  }
  
  try {
    // Get the user's ID token
    const idToken = await auth.currentUser.getIdToken();
    console.log('Retrieved ID token for testing');
    
    // Get the API Gateway URL from environment or use default
    const gatewayUrl = import.meta.env.VITE_API_GATEWAY_URL || 
                       'http://localhost:8888'; // Local mock gateway
    
    // Test fetchPuzzle endpoint
    console.log(`Testing API Gateway at ${gatewayUrl}/fetchPuzzle`);
    
    const today = new Date().toISOString().split('T')[0];
    const response = await fetch(`${gatewayUrl}/fetchPuzzle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ date: today })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Gateway test failed: ${response.status} ${response.statusText}`, errorText);
      return;
    }
    
    const data = await response.json();
    console.log('API Gateway test successful!', data);
    return data;
  } catch (error) {
    console.error('Error testing API Gateway:', error);
  }
};

// Add a function to log token information
export const logTokenInfo = async () => {
  if (!auth?.currentUser) {
    console.error('User not authenticated. Please sign in first.');
    return;
  }
  
  try {
    const idToken = await auth.currentUser.getIdToken();
    const tokenParts = idToken.split('.');
    
    if (tokenParts.length !== 3) {
      console.error('Invalid token format');
      return;
    }
    
    // Decode the payload (middle part)
    const payload = JSON.parse(atob(tokenParts[1]));
    
    console.log('Token Information:');
    console.log('- User ID:', payload.user_id || payload.sub || 'Unknown');
    console.log('- Issuer:', payload.iss || 'Unknown');
    console.log('- Audience:', payload.aud || 'Unknown');
    console.log('- Expiration:', new Date((payload.exp || 0) * 1000).toLocaleString());
    console.log('- Issued At:', new Date((payload.iat || 0) * 1000).toLocaleString());
    
    // For authentication testing with API Gateway
    console.log('\nAPI Gateway Authentication Header:');
    console.log(`Authorization: Bearer ${idToken.substring(0, 15)}...`);
    
    return payload;
  } catch (error) {
    console.error('Error logging token info:', error);
  }
};

// Export a window method for testing in browser console
if (typeof window !== 'undefined') {
  (window as any).testFirebase = {
    logConnectionInfo: logFirebaseConnectionInfo,
    checkDocument: checkFirestoreDocument,
    testFunction: testGetDailyScoresStats,
    testApiGateway,
    logTokenInfo
  };
} 