import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../App';
import '../scss/main.scss';
import { dateKeyForToday } from '../utils/dateUtils';
import firebaseConfig from '../env/firebaseConfig'; // Needed for project ID fallback
import { auth, useEmulators, ensureAuthenticated } from '../services/firebaseService'; // Import auth and useEmulators

interface DailyScoreStats {
  lowestScore: number | null;
  averageScore: number | null;
  totalPlayers: number;
  playersWithLowestScore: number;
}

interface LandingScreenProps {
  // No props needed for now
}

const LandingScreen: React.FC<LandingScreenProps> = () => {
  const { signIn, signUp, playAsGuest, logOut, currentUser, isGuest, isAuthenticated } = useAuth();
  const { setShowLandingPage } = useNavigation();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAppContent, setShowAppContent] = useState(false);
  const [stats, setStats] = useState<DailyScoreStats>({
    lowestScore: null,
    averageScore: null,
    totalPlayers: 0,
    playersWithLowestScore: 0
  });
  const [usersWithBestScore, setUsersWithBestScore] = useState<number>(0);

  // Check if user is authenticated as a regular user (not guest)
  const isRegularUser = isAuthenticated && !isGuest;

  // Fetch global stats on component mount
  useEffect(() => {
    const fetchDailyScoresStats = async () => {
      const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
      console.log(`Attempting to fetch daily scores stats for ${today}`);
      
      // Helper function to add delay before retry
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      // Max retries and starting delay
      const MAX_RETRIES = 3;
      const STARTING_DELAY_MS = 500;
      
      try {
        let idToken: string | null = null;

        // Get current authentication status
        if (currentUser) {
          try {
            console.log('Current user exists, getting ID token');
            // Use Promise.race with a timeout to prevent hanging
            const tokenPromise = currentUser.getIdToken(true); // Force refresh token
            const timeoutPromise = new Promise<null>((_, reject) => 
              setTimeout(() => reject(new Error("Token request timed out")), 5000)
            );
            
            idToken = await Promise.race([tokenPromise, timeoutPromise]) as string;
            console.log('Successfully retrieved ID token');
          } catch (tokenError) {
            console.error('Error getting ID token:', tokenError);
            if (!isAuthenticated) {
              console.warn('Cannot proceed without authentication');
              throw new Error('Authentication required to fetch stats');
            }
          }
        }

        const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const projectId = firebaseConfig.projectId || 'color-lock-prod';
        const region = 'us-central1'; // Ensure this matches your deployment/emulator

        let functionUrl: string;
        if (isLocalDev && useEmulators) {
          // Use direct emulator URL for the HTTP endpoint
          functionUrl = `http://localhost:5001/${projectId}/${region}/getDailyScoresStatsHttp`;
          console.log(`Using Emulator URL for stats: ${functionUrl}`);
        } else {
          // Use API Gateway URL for production
          const gatewayApiUrl = import.meta.env.VITE_API_GATEWAY_URL;
          if (!gatewayApiUrl) {
            console.error("VITE_API_GATEWAY_URL is not set in environment variables!");
            throw new Error("API Gateway URL is not configured.");
          }
          // The path should match the one defined in openapi.yaml for the gateway
          functionUrl = `${gatewayApiUrl}/getDailyScoresStats`;
          console.log(`Using API Gateway URL for stats: ${functionUrl}`);
        }

        // Execute request with retry logic
        let result = null;
        let lastError = null;
        
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if (attempt > 0) {
            // Add exponential backoff delay before retries
            const delayMs = STARTING_DELAY_MS * Math.pow(2, attempt - 1);
            console.log(`Retry attempt ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms delay`);
            await delay(delayMs);
          }
          
          try {
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };
            
            // Always include auth token if available
            if (idToken) {
              headers['Authorization'] = `Bearer ${idToken}`;
              console.log('Including authentication token in request');
            } else {
              console.warn('No ID token available for API call');
              // In production, we'll continue without token and let the server decide
            }
            
            // Add emulator header if needed for local testing
            if (isLocalDev && useEmulators && currentUser?.uid) {
              headers['X-Emulator-User-Id'] = currentUser.uid;
            }

            console.log(`Making fetch request to ${functionUrl} (attempt ${attempt + 1}/${MAX_RETRIES})`);
            console.log('Request headers:', Object.keys(headers));
            
            const response = await fetch(functionUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({ puzzleId: today }),
              credentials: 'same-origin', // Helps with cookies if used
            });

            console.log(`Stats fetch response status: ${response.status}`);

            if (!response.ok) {
              const errorBody = await response.text();
              console.error(`HTTP error fetching stats: ${response.status} - ${response.statusText}`, errorBody);
              
              // Try to parse error if JSON
              let errorJson = {};
              try { errorJson = JSON.parse(errorBody); } catch(e){}
              
              // For specific errors that we shouldn't retry
              if (response.status === 401 || response.status === 403) {
                console.error('Authentication error - not retrying');
                throw new Error(`Authentication failed (${response.status}): ${(errorJson as any)?.error || response.statusText}`);
              }
              
              // For other errors, continue retry loop
              lastError = new Error(`Failed to fetch stats (${response.status}): ${(errorJson as any)?.error || response.statusText}`);
              continue;
            }

            result = await response.json();
            console.log('Stats fetch result:', result);
            break; // Success, exit retry loop
          } catch (fetchError: any) {
            console.error(`Fetch error on attempt ${attempt + 1}:`, fetchError);
            lastError = fetchError;
            
            // Check for CORS errors or network issues that might be retryable
            if (fetchError.message?.includes('NetworkError') || 
                fetchError.message?.includes('CORS') || 
                fetchError.message?.includes('Failed to fetch')) {
              continue; // Retry
            } else {
              throw fetchError; // Non-retryable error
            }
          }
        }
        
        // If we exhausted retries, throw the last error
        if (!result && lastError) {
          console.error('All retry attempts failed');
          throw lastError;
        }

        // Process results
        if (result && result.success && result.stats) {
          console.log('Setting stats from API response');
          setStats(result.stats);
          setUsersWithBestScore(result.stats.playersWithLowestScore || 0);
        } else {
          console.error('Stats fetch failed or returned invalid data:', result?.error || 'No stats data');
          fallbackToSampleData();
        }

      } catch (error: any) {
        console.error('Error in fetchDailyScoresStats:', error);
        fallbackToSampleData();
      }
    };
    
    // Helper function to use sample data when API calls fail
    const fallbackToSampleData = () => {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('Using sample data for development');
        setStats({
          lowestScore: 6,
          averageScore: 9.5,
          totalPlayers: 10,
          playersWithLowestScore: 3
        });
        setUsersWithBestScore(3);
      } else {
         // Set to empty/default in production if fetch fails
         setStats({ lowestScore: null, averageScore: null, totalPlayers: 0, playersWithLowestScore: 0 });
         setUsersWithBestScore(0);
      }
    };
    
    fetchDailyScoresStats();
  }, [currentUser, isAuthenticated]); // Add currentUser/isAuthenticated dependency

  // Simplified loading - just show content directly
  useEffect(() => {
    // Skip the animation sequence and just show the app content immediately
    setShowAppContent(true);
  }, []);

  // Show loading spinner if still processing authentication
  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  // Skip animation and directly show content
  if (!showAppContent) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      if (authMode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      // Navigate to the game after successful authentication
      setShowLandingPage(false);
    } catch (err: any) {
      console.error('Authentication error:', err);
      setError(err.message || 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };
  
  const handleGuestMode = async () => {
    setError(null);
    setLoading(true);
    
    console.log('LandingScreen: Starting guest mode flow');
    
    // Add a safety timeout to prevent UI from being stuck in loading state
    const safetyTimeout = setTimeout(() => {
      console.warn('LandingScreen: Guest mode safety timeout triggered after 15 seconds');
      setLoading(false);
      setError('Operation timed out. Please try again.');
    }, 15000);
    
    try {
      console.log('LandingScreen: Calling playAsGuest()');
      await playAsGuest();
      console.log('LandingScreen: Guest login successful, navigating to game');
      
      // Clear the safety timeout since we succeeded
      clearTimeout(safetyTimeout);
      
      // Check if we have a user before navigating
      if (currentUser || isAuthenticated) {
        // Navigate to the game screen after successful guest login
        setShowLandingPage(false);
      } else {
        console.error('LandingScreen: Authentication succeeded but no user is present');
        setError('Authentication succeeded but failed to initialize user. Please try again.');
      }
    } catch (err: any) {
      console.error('LandingScreen: Guest mode error:', err);
      
      // Clear the safety timeout since we got an explicit error
      clearTimeout(safetyTimeout);
      
      // Try to extract a meaningful error message
      let errorMessage = 'An error occurred while entering guest mode';
      if (err.message) {
        errorMessage = err.message;
      } else if (err.code) {
        errorMessage = `Error code: ${err.code}`;
      }
      
      setError(errorMessage);
      
      // If Firebase was partially initialized but failed, try to force navigation anyway
      if (err.message?.includes('timed out') && isAuthenticated) {
        console.warn('LandingScreen: Trying to navigate despite timeout');
        setShowLandingPage(false);
      }
    } finally {
      setLoading(false);
    }
  };
  
  const handleSignOut = async () => {
    setError(null);
    setLoading(true);
    
    try {
      await logOut();
      console.log("User signed out successfully");
    } catch (err: any) {
      console.error('Sign out error:', err);
      setError(err.message || 'An error occurred while signing out');
    } finally {
      setLoading(false);
    }
  };
  
  const handlePlayGame = () => {
    // Update the navigation context to show the game
    setShowLandingPage(false);
  };
  
  const toggleAuthMode = () => {
    setAuthMode(prevMode => (prevMode === 'signin' ? 'signup' : 'signin'));
    setError(null);
  };

  console.log("Auth state:", { isAuthenticated, isGuest, isRegularUser });

  return (
    <div className="landing-container app-fade-in">
      <div className="landing-header">
        <img src="/tbs_logo.png" alt="The Banana Standard" className="landing-logo" />
        <h1 className="landing-title">
          <span className="title-word color-word-1">Color</span>
          <span className="title-space">&nbsp;&nbsp;</span>
          <span className="title-word color-word-2">Lock</span>
        </h1>
      </div>

      <div className="global-stats-container">
        <h2>Today's Global Stats</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">
              {stats.averageScore !== null 
                ? Number(stats.averageScore).toFixed(1) 
                : '—'}
            </div>
            <div className="stat-label">Average Score</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.lowestScore !== null ? stats.lowestScore : '—'}</div>
            <div className="stat-label">Best Score</div>
          </div>
        </div>
        <p className="stats-highlight">
          {stats.totalPlayers > 0 ? (
            `${usersWithBestScore} out of ${stats.totalPlayers} players ${usersWithBestScore === 1 ? 'has' : 'have'} achieved the best score`
          ) : (
            'Be the first to play today!'
          )}
        </p>
      </div>

      <div className="landing-auth-container">
        {isRegularUser ? (
          <>
            <button 
              className="landing-signin-button"
              onClick={handlePlayGame}
            >
              Play Color Lock
            </button>
            <button 
              className="landing-guest-button"
              onClick={handleSignOut}
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <button 
              className="landing-signin-button"
              onClick={() => setShowAuthModal(true)}
            >
              Sign In / Sign Up
            </button>
            <button 
              className="landing-guest-button"
              onClick={handleGuestMode}
            >
              Play as Guest
            </button>
          </>
        )}
      </div>

      {showAuthModal && (
        <div className="modal-overlay">
          <div className="auth-modal">
            <button className="modal-close" onClick={() => setShowAuthModal(false)}>×</button>
            
            <form className="auth-form" onSubmit={handleSubmit}>
              <h2>{authMode === 'signin' ? 'Sign In' : 'Create Account'}</h2>
              
              {error && <div className="auth-error">{error}</div>}
              
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="auth-input"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="auth-input"
                />
              </div>
              
              <button 
                type="submit" 
                className="auth-button primary-button"
                disabled={loading}
              >
                {loading 
                  ? 'Loading...' 
                  : authMode === 'signin' 
                    ? 'Sign In' 
                    : 'Sign Up'
                }
              </button>
            </form>
            
            <div className="auth-separator">
              <span>OR</span>
            </div>
            
            <button 
              onClick={handleGuestMode} 
              className="auth-button guest-button"
              disabled={loading}
            >
              Continue as Guest
            </button>
            
            <div className="auth-toggle">
              {authMode === 'signin' ? (
                <p>
                  Don't have an account?{' '}
                  <button onClick={toggleAuthMode} className="toggle-button">
                    Sign Up
                  </button>
                </p>
              ) : (
                <p>
                  Already have an account?{' '}
                  <button onClick={toggleAuthMode} className="toggle-button">
                    Sign In
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingScreen; 