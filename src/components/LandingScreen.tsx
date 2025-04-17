import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../App';
import '../scss/main.scss';
import { dateKeyForToday } from '../utils/dateUtils';
import firebaseConfig from '../env/firebaseConfig'; // Needed for project ID fallback
import { auth, useEmulators, ensureAuthenticated, getDailyScoresStatsCallable } from '../services/firebaseService'; // Import auth and useEmulators

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
  const [statsLoading, setStatsLoading] = useState(true);
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

  // Fetch global stats on component mount using callable function
  useEffect(() => {
    const fetchDailyScoresStats = async () => {
      setStatsLoading(true); // Start loading stats
      const today = dateKeyForToday();
      console.log(`Attempting to fetch daily scores stats for ${today} via callable function`);

      try {
        // Call the callable function
        const result = await getDailyScoresStatsCallable({ puzzleId: today });

        console.log('getDailyScoresStats callable result:', result.data);

        if (result.data.success && result.data.stats) {
          console.log('Setting stats from callable response');
          setStats(result.data.stats);
          setUsersWithBestScore(result.data.stats.playersWithLowestScore || 0);
        } else {
          console.error('Stats fetch failed or returned invalid data:', result.data.error || 'No stats data');
          fallbackToSampleData();
        }
      } catch (error: any) {
        console.error('Error calling getDailyScoresStats callable:', error);
        // Handle specific Firebase Functions errors
        let message = error.message || 'Failed to load daily stats';
        if (error.code === 'failed-precondition') {
            message = 'App verification failed. Cannot load stats.';
        } else if (error.code === 'unauthenticated') {
            message = 'Authentication error. Cannot load stats.'; // Should not happen if guests allowed
        }
        setError(message); // Set error state to display to user
        fallbackToSampleData();
      } finally {
        setStatsLoading(false); // Finish loading stats
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
         // Optionally set an error message here if not already set
         if (!error) setError("Could not load today's stats.");
      }
    };

    fetchDailyScoresStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Simplified loading - just show content directly
  useEffect(() => {
    setShowAppContent(true);
  }, []);

  // Show loading spinner if still processing authentication OR stats
  if (loading || statsLoading) { // Check both loading states
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        {/* Optional: Differentiate loading messages */}
        {/* <p>{loading ? 'Authenticating...' : 'Loading Stats...'}</p> */}
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

    const safetyTimeout = setTimeout(() => {
      console.warn('LandingScreen: Guest mode safety timeout triggered after 15 seconds');
      setLoading(false);
      setError('Operation timed out. Please try again.');
    }, 15000);

    try {
      console.log('LandingScreen: Calling playAsGuest()');
      await playAsGuest();
      console.log('LandingScreen: Guest login successful, navigating to game');

      clearTimeout(safetyTimeout);

      // Check if we have a user before navigating
      // Use a small delay to allow auth state to propagate if needed
      setTimeout(() => {
          if (isAuthenticated) { // Check isAuthenticated flag from context
              setShowLandingPage(false);
          } else {
              console.error('LandingScreen: Authentication succeeded but state not updated');
              setError('Authentication succeeded but failed to initialize user. Please refresh.');
          }
      }, 100); // 100ms delay

    } catch (err: any) {
      console.error('LandingScreen: Guest mode error:', err);
      clearTimeout(safetyTimeout);
      let errorMessage = 'An error occurred while entering guest mode';
      if (err.message) {
        errorMessage = err.message;
      } else if (err.code) {
        errorMessage = `Error code: ${err.code}`;
      }
      setError(errorMessage);
    } finally {
      // Don't set loading false immediately if navigation might happen
      // setLoading(false); // Let navigation handle the loading state implicitly
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
          <span className="title-space">  </span>
          <span className="title-word color-word-2">Lock</span>
        </h1>
      </div>

      {/* Display error if stats failed to load */}
      {error && !showAuthModal && <div className="auth-error" style={{ maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>{error}</div>}

      <div className="global-stats-container">
        <h2>Today's Global Stats</h2>
        {statsLoading ? (
          <div className="spinner" style={{margin: '2rem auto'}}></div>
        ) : (
          <>
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
          </>
        )}
      </div>

      <div className="landing-auth-container">
        {isRegularUser ? (
          <>
            <button
              className="landing-signin-button"
              onClick={handlePlayGame}
              disabled={loading} // Disable if auth action in progress
            >
              Play Color Lock
            </button>
            <button
              className="landing-guest-button"
              onClick={handleSignOut}
              disabled={loading} // Disable if auth action in progress
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <button
              className="landing-signin-button"
              onClick={() => { setError(null); setShowAuthModal(true); }} // Clear error when opening modal
              disabled={loading} // Disable if auth action in progress
            >
              Sign In / Sign Up
            </button>
            <button
              className="landing-guest-button"
              onClick={handleGuestMode}
              disabled={loading} // Disable if auth action in progress
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