import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../scss/main.scss';

interface SignInScreenProps {
  // No props needed for now
}

type AuthMode = 'signin' | 'signup';

const SignInScreen: React.FC<SignInScreenProps> = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const { signIn, signUp, playAsGuest } = useAuth();
  
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
    } catch (err: any) {
      console.error('Guest mode error:', err);
      setError(err.message || 'An error occurred while entering guest mode');
    } finally {
      setLoading(false);
    }
  };
  
  const toggleAuthMode = () => {
    setAuthMode(prevMode => (prevMode === 'signin' ? 'signup' : 'signin'));
    setError(null);
  };
  
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <img src="/tbs_logo.png" alt="Color Lock" className="auth-logo" />
          <h1 className="auth-title">Color Lock</h1>
        </div>
        
        <div className="auth-form-container">
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
            Play as Guest
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
    </div>
  );
};

export default SignInScreen; 