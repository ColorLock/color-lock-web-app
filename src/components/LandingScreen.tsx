import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../App';
import '../scss/main.scss';
import { dateKeyForToday } from '../utils/dateUtils';
import { useDataCache } from '../contexts/DataCacheContext'; // Import the new context hook

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
  const { dailyScoresStats, loadingStates, errorStates } = useDataCache(); // Use the cache context

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null); // Rename error state for clarity
  const [authLoading, setAuthLoading] = useState(false); // Rename loading state
  const [showAppContent, setShowAppContent] = useState(false);

  // Use loading/error state from context
  const statsLoading = loadingStates.dailyScores;
  const statsError = errorStates.dailyScores;

  // Simplified loading - just show content directly
  useEffect(() => {
    setShowAppContent(true);
  }, []);

  // Show loading spinner if still processing authentication
  if (authLoading) { // Check auth loading state
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
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (authMode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password, displayName);
        console.log("Sign up completed successfully in LandingScreen");
      }
      setShowAuthModal(false);
      
      // Add a small delay before navigation to ensure auth state is updated
      setTimeout(() => {
        console.log("Navigating away from landing page after auth");
        setShowLandingPage(false);
      }, 500);
    } catch (err: any) {
      console.error('Authentication error:', err);
      setAuthError(err.message || 'An error occurred during authentication');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGuestMode = async () => {
    setAuthError(null);
    setAuthLoading(true);
    console.log('LandingScreen: Starting guest mode flow');
    const safetyTimeout = setTimeout(() => {
      console.warn('LandingScreen: Guest mode safety timeout triggered after 15 seconds');
      setAuthLoading(false);
      setAuthError('Operation timed out. Please try again.');
    }, 15000);

    try {
      console.log('LandingScreen: Calling playAsGuest()');
      await playAsGuest();
      console.log('LandingScreen: Guest login successful, navigating to game');
      clearTimeout(safetyTimeout);
      setTimeout(() => {
          if (isAuthenticated) {
              setShowLandingPage(false);
          } else {
              console.error('LandingScreen: Authentication succeeded but state not updated');
              setAuthError('Authentication succeeded but failed to initialize user. Please refresh.');
          }
      }, 100);
    } catch (err: any) {
      console.error('LandingScreen: Guest mode error:', err);
      clearTimeout(safetyTimeout);
      let errorMessage = 'An error occurred while entering guest mode';
      if (err.message) {
        errorMessage = err.message;
      } else if (err.code) {
        errorMessage = `Error code: ${err.code}`;
      }
      setAuthError(errorMessage);
      setAuthLoading(false); // Ensure loading stops on error
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await logOut();
      console.log("User signed out successfully");
    } catch (err: any) {
      console.error('Sign out error:', err);
      setAuthError(err.message || 'An error occurred while signing out');
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePlayGame = () => {
    setShowLandingPage(false);
  };

  const toggleAuthMode = () => {
    setAuthMode(prevMode => (prevMode === 'signin' ? 'signup' : 'signin'));
    setAuthError(null);
    setEmail('');
    setPassword('');
    setDisplayName('');
  };

  const handleCloseModal = () => {
    setShowAuthModal(false);
    setAuthError(null);
    setEmail('');
    setPassword('');
    setDisplayName('');
  };

  // Check if user is authenticated as a regular user (not guest)
  const isRegularUser = isAuthenticated && !isGuest;
  console.log("Auth state:", { isAuthenticated, isGuest, isRegularUser, displayName: currentUser?.displayName });

  // Get derived stats values from context
  const displayStats = dailyScoresStats || { lowestScore: null, averageScore: null, totalPlayers: 0, playersWithLowestScore: 0 };
  const usersWithBestScore = displayStats.playersWithLowestScore;

  return (
    <div className="landing-container app-fade-in">
      <div className="landing-header">
        <img src="/tbs_logo.png" alt="The Banana Standard" className="landing-logo" />
        <h1 className="landing-title">
          <span className="title-word color-word-1">Color</span>
          <span className="title-space">  </span>
          <span className="title-word color-word-2">Lock</span>
        </h1>
        {isRegularUser && currentUser?.displayName && (
            <p className="welcome-message">Welcome, {currentUser.displayName}!</p>
        )}
      </div>

      {/* Display stats error if present */}
      {statsError && !showAuthModal && <div className="auth-error" style={{ maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>{statsError}</div>}
      {/* Display auth error if present */}
      {authError && !showAuthModal && <div className="auth-error" style={{ maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>{authError}</div>}


      <div className="global-stats-container">
        <h2>Today's Global Stats</h2>
        {statsLoading ? (
          <div className="spinner" style={{margin: '2rem auto'}}></div>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">
                  {displayStats.averageScore !== null
                    ? Number(displayStats.averageScore).toFixed(1)
                    : '—'}
                </div>
                <div className="stat-label">Average Score</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{displayStats.lowestScore !== null ? displayStats.lowestScore : '—'}</div>
                <div className="stat-label">Best Score</div>
              </div>
            </div>
            <p className="stats-highlight">
              {displayStats.totalPlayers > 0 ? (
                `${usersWithBestScore} out of ${displayStats.totalPlayers} players ${usersWithBestScore === 1 ? 'has' : 'have'} achieved the best score`
              ) : (
                statsError ? 'Stats unavailable' : 'Be the first to play today!' // Show error or default message
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
              disabled={authLoading}
            >
              Play Color Lock
            </button>
            <button
              className="landing-guest-button"
              onClick={handleSignOut}
              disabled={authLoading}
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <button
              className="landing-signin-button"
              onClick={() => { setAuthError(null); setShowAuthModal(true); }}
              disabled={authLoading}
            >
              Sign In / Sign Up
            </button>
            <button
              className="landing-guest-button"
              onClick={handleGuestMode}
              disabled={authLoading}
            >
              Play as Guest
            </button>
          </>
        )}
      </div>

      {showAuthModal && (
        <div className="modal-overlay">
          <div className="auth-modal">
            <button className="modal-close" onClick={handleCloseModal}>×</button>

            <form className="auth-form" onSubmit={handleSubmit}>
              <h2>{authMode === 'signin' ? 'Sign In' : 'Create Account'}</h2>

              {authError && <div className="auth-error">{authError}</div>}

              {/* Display Name Input (only for signup) */}
              {authMode === 'signup' && (
                <div className="form-group">
                  <label htmlFor="display-name">Display Name</label>
                  <input
                    type="text"
                    id="display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Choose a username"
                    required
                    className="auth-input"
                  />
                </div>
              )}

              {/* Email Input */}
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

              {/* Password Input */}
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

              {/* Submit Button */}
              <button
                type="submit"
                className="auth-button primary-button"
                disabled={authLoading}
              >
                {authLoading
                  ? 'Loading...'
                  : authMode === 'signin'
                    ? 'Sign In'
                    : 'Sign Up'
                }
              </button>
            </form>

            {/* Separator */}
            <div className="auth-separator">
              <span>OR</span>
            </div>

            {/* Guest Button */}
            <button
              onClick={handleGuestMode}
              className="auth-button guest-button"
              disabled={authLoading}
            >
              Continue as Guest
            </button>

            {/* Toggle Auth Mode */}
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