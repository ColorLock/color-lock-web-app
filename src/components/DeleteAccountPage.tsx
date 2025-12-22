import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faExclamationTriangle, faCheckCircle, faSpinner } from '@fortawesome/free-solid-svg-icons';

type PageState = 'form' | 'success' | 'not-signed-in';

const DeleteAccountPage: React.FC = () => {
  const { currentUser, isGuest, deleteAccount, signIn } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageState, setPageState] = useState<PageState>(
    currentUser && !isGuest ? 'form' : 'not-signed-in'
  );
  
  // For users who need to sign in first
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSigningIn(true);

    try {
      await signIn(email, password);
      setPageState('form');
      // Clear password after sign-in for security
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate confirmation text
    if (confirmText.toLowerCase() !== 'delete my account') {
      setError('Please type "DELETE MY ACCOUNT" to confirm.');
      return;
    }

    // Validate email matches current user
    if (currentUser?.email && email.toLowerCase() !== currentUser.email.toLowerCase()) {
      setError('The email address does not match your account.');
      return;
    }

    setIsLoading(true);

    try {
      await deleteAccount(email, password);
      setPageState('success');
    } catch (err: any) {
      setError(err.message || 'Failed to delete account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Success state
  if (pageState === 'success') {
    return (
      <div className="delete-account-page">
        <div className="delete-account-container success">
          <div className="success-icon">
            <FontAwesomeIcon icon={faCheckCircle} />
          </div>
          <h1>Account Deleted</h1>
          <p>Your account and all associated data have been permanently deleted.</p>
          <a href="/" className="home-link">Return to Home</a>
        </div>
      </div>
    );
  }

  // Not signed in state - show sign in form first
  if (pageState === 'not-signed-in' || !currentUser || isGuest) {
    return (
      <div className="delete-account-page">
        <div className="delete-account-container">
          <div className="header">
            <img src="/colorlock_icon.jpeg" alt="ColorLock" className="logo" />
            <h1>Delete Your Account</h1>
          </div>

          <div className="warning-banner">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <span>Please sign in to delete your account</span>
          </div>

          <p className="description">
            To delete your ColorLock account, please first sign in with your email and password.
          </p>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn} className="delete-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                disabled={isSigningIn}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={isSigningIn}
              />
            </div>

            <button
              type="submit"
              className="sign-in-button"
              disabled={isSigningIn || !email || !password}
            >
              {isSigningIn ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin />
                  <span>Signing In...</span>
                </>
              ) : (
                'Sign In to Continue'
              )}
            </button>
          </form>

          <div className="footer-links">
            <a href="/">Cancel and return home</a>
          </div>
        </div>
      </div>
    );
  }

  // Main delete account form (user is signed in)
  return (
    <div className="delete-account-page">
      <div className="delete-account-container">
        <div className="header">
          <img src="/colorlock_icon.jpeg" alt="ColorLock" className="logo" />
          <h1>Delete Your Account</h1>
        </div>

        <div className="warning-banner destructive">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>This action cannot be undone</span>
        </div>

        <div className="warning-details">
          <p>Deleting your account will permanently remove:</p>
          <ul>
            <li>Your user profile and settings</li>
            <li>All puzzle history and statistics</li>
            <li>Your leaderboard entries and scores</li>
            <li>Any streaks or achievements</li>
          </ul>
        </div>

        <p className="signed-in-as">
          Signed in as: <strong>{currentUser.email}</strong>
        </p>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <form onSubmit={handleDeleteAccount} className="delete-form">
          <div className="form-group">
            <label htmlFor="email">Confirm Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Confirm Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirm">
              Type <strong>DELETE MY ACCOUNT</strong> to confirm
            </label>
            <input
              type="text"
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE MY ACCOUNT"
              required
              disabled={isLoading}
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            className="delete-button"
            disabled={isLoading || !email || !password || confirmText.toLowerCase() !== 'delete my account'}
          >
            {isLoading ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin />
                <span>Deleting Account...</span>
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faTrash} />
                <span>Delete My Account</span>
              </>
            )}
          </button>
        </form>

        <div className="footer-links">
          <a href="/">Cancel and return home</a>
        </div>
      </div>
    </div>
  );
};

export default DeleteAccountPage;







