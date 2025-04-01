import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../App';
import '../scss/main.scss';

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

  // Check if user is authenticated as a regular user (not guest)
  const isRegularUser = isAuthenticated && !isGuest;

  // Hard-coded global stats
  const globalStats = {
    averageScore: 12,
    bestScore: 6
  };

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
    
    try {
      await playAsGuest();
      // Navigate to the game screen after successful guest login
      setShowLandingPage(false);
    } catch (err: any) {
      console.error('Guest mode error:', err);
      setError(err.message || 'An error occurred while entering guest mode');
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
            <div className="stat-value">{globalStats.averageScore}</div>
            <div className="stat-label">Average Score</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{globalStats.bestScore}</div>
            <div className="stat-label">Best Score</div>
          </div>
        </div>
        <p className="stats-highlight">1 out of 4 players have achieved the best score</p>
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