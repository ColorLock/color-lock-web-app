import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../scss/main.scss';

interface SignUpButtonProps {
  onClose?: () => void;
}

const SignUpButton: React.FC<SignUpButtonProps> = ({ onClose }) => {
  const [showSignUp, setShowSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const { signUp, isGuest } = useAuth();
  
  if (!isGuest) return null;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      await signUp(email, password);
      setSuccess(true);
      setEmail('');
      setPassword('');
      
      // Hide the form after successful signup
      setTimeout(() => {
        setShowSignUp(false);
        setSuccess(false);
        if (onClose) onClose();
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