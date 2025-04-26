import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../scss/main.scss';
import { verifyAuthState } from '../services/firebaseService';

interface SignUpButtonProps {
  onClose?: () => void;
}

const SignUpButton: React.FC<SignUpButtonProps> = ({ onClose }) => {
  const [showSignUp, setShowSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const { signUp, isGuest } = useAuth();
  
  // Check authentication state when component renders
  useEffect(() => {
    verifyAuthState().then(user => {
      console.log("SignUpButton mounted, current auth state:", { 
        isGuest, 
        hasUser: !!user,
        isAnonymous: user?.isAnonymous
      });
    });
  }, [isGuest]);
  
  // If we're not a guest user, don't show this component
  if (!isGuest) {
    console.log("User is not a guest, hiding SignUpButton");
    return null;
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      console.log("Starting sign up process...");
      
      // Verify auth state before signup
      await verifyAuthState();
      
      const user = await signUp(email, password, displayName);
      console.log("Sign up successful, user:", user.uid);
      
      // Verify auth state after signup
      await verifyAuthState();
      
      setSuccess(true);
      setEmail('');
      setPassword('');
      setDisplayName('');
      
      // Use a longer timeout to ensure Firebase auth state has time to update
      setTimeout(async () => {
        console.log("Sign up completion timeout reached");
        
        // Verify final auth state
        await verifyAuthState();
        
        setShowSignUp(false);
        setSuccess(false);
        if (onClose) onClose();
        
        // Force a page refresh to ensure all auth state is properly updated
        window.location.reload();
      }, 2000);
      
    } catch (err: any) {
      console.error('Sign up error:', err);
      setError(err.message || 'An error occurred during sign up');
    } finally {
      setLoading(false);
    }
  };
  
  const toggleSignUp = () => {
    setShowSignUp(prev => !prev);
    setError(null);
    setSuccess(false);
    setEmail('');
    setPassword('');
    setDisplayName('');
  };
  
  return (
    <div className="signup-container">
      {!showSignUp ? (
        <button 
          onClick={toggleSignUp} 
          className="signup-button"
          aria-label="Create Account"
        >
          Sign Up
        </button>
      ) : (
        <div className="signup-modal">
          <div className="signup-modal-content">
            <button 
              className="close-button" 
              onClick={toggleSignUp}
              aria-label="Close sign up form"
            >
              &times;
            </button>
            
            <h3>Create Account</h3>
            
            {error && <div className="auth-error">{error}</div>}
            {success && <div className="auth-success">Account created successfully!</div>}
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="signup-display-name">Display Name</label>
                <input
                  type="text"
                  id="signup-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Choose a username"
                  required
                  className="auth-input"
                  disabled={loading || success}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="signup-email">Email</label>
                <input
                  type="email"
                  id="signup-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="auth-input"
                  disabled={loading || success}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="signup-password">Password</label>
                <input
                  type="password"
                  id="signup-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="auth-input"
                  disabled={loading || success}
                />
              </div>
              
              <button 
                type="submit" 
                className="auth-button primary-button"
                disabled={loading || success}
              >
                {loading ? 'Loading...' : success ? 'Success!' : 'Sign Up'}
              </button>
            </form>
            
            <p className="signup-message">
              Save your progress and play on multiple devices
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SignUpButton; 