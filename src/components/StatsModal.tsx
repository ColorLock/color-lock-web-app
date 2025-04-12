import React, { useState, useEffect, memo, useCallback } from 'react';
import '../scss/main.scss';
import { TileColor } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faShareNodes, faCopy, faEnvelope, faShare } from '@fortawesome/free-solid-svg-icons';
import { faTwitter, faFacebookF } from '@fortawesome/free-brands-svg-icons';
import { GameStatistics, defaultStats } from '../types/stats';
import { dateKeyForToday } from '../utils/dateUtils';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: GameStatistics | null;
  onShareStats: () => void;
  isLoading?: boolean;
}

// Use React.memo to wrap the component
const StatsModal: React.FC<StatsModalProps> = memo(({ 
  isOpen, 
  onClose, 
  stats, 
  onShareStats,
  isLoading = false // Default to false
}) => {
  if (!isOpen) return null;
  
  // State for sharing functionality
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [isWebShareSupported, setIsWebShareSupported] = useState<boolean>(false);
  
  // Check if Web Share API is supported
  useEffect(() => {
    setIsWebShareSupported(typeof navigator.share === 'function');
  }, []);
  
  // Handle outside click
  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if the click is directly on the overlay, not its children
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);
  
  // Use defaultStats if stats prop is null or undefined
  const currentStats = stats || defaultStats;
  const allTimeStats = currentStats.allTimeStats || defaultStats.allTimeStats; // Ensure allTimeStats exists
  const todayKey = dateKeyForToday(); // Get today's date key
  
  // Helper to safely display values, using defaultStats as fallback
  const safelyDisplay = (value: any, type: 'number' | 'arrayLength' | 'mapKeys' | 'bestScoreToday' = 'number'): string | number => {
    // Handle different types with fallbacks
    try {
      if (type === 'bestScoreToday') {
        const score = allTimeStats?.bestScoresByDay?.[todayKey];
        return score !== null && score !== undefined && !isNaN(Number(score)) ? Number(score) : 'N/A';
      }
      if (type === 'number') {
        const num = Number(value);
        return !isNaN(num) ? num : 0;
      }
      if (type === 'arrayLength') {
        return Array.isArray(value) ? value.length : 0;
      }
      if (type === 'mapKeys') {
        return (typeof value === 'object' && value !== null) ? Object.keys(value).length : 0;
      }
    } catch (e) {
      console.error("Error displaying stat:", e, { value, type });
      return type === 'bestScoreToday' ? 'N/A' : 0; // Fallback on error
    }
    return String(value ?? (type === 'bestScoreToday' ? 'N/A' : 0)); // Final fallback
  };
  
  // Generate formatted share text using the passed callback
  // We still need a local version for direct sharing actions like copy/social
  const getFormattedShareText = useCallback(() => {
    const safeNum = (val: any) => (typeof val === 'number' && !isNaN(val) ? val : 0);
    const safeArrLen = (val: any) => (Array.isArray(val) ? val.length : 0);

    let shareText = `🔒 Color Lock Stats 🔒\n\n`;
    shareText += `Today's Game (${todayKey}):\n`;
    const bestToday = allTimeStats?.bestScoresByDay?.[todayKey] ?? 'N/A';
    shareText += `Best Score: ${bestToday}\n`;
    const attemptsToday = allTimeStats?.attemptsPerDay?.[todayKey] ?? 0;
    shareText += `Attempts Today: ${attemptsToday}\n`;
    const winsToday = allTimeStats?.winsPerDay?.[todayKey] ?? 0;
    shareText += `Wins Today: ${winsToday}\n\n`;

    shareText += `All-time Stats:\n`;
    shareText += `Current Streak: ${safeNum(allTimeStats?.currentStreak)}\n`;
    shareText += `Longest Streak: ${safeNum(allTimeStats?.longestStreak)}\n`;
    shareText += `Days Played: ${safeArrLen(allTimeStats?.playedDays)}\n`;
    shareText += `Goals Achieved: ${safeArrLen(allTimeStats?.goalAchievedDays)}\n`;
    shareText += `Total Wins: ${safeNum(allTimeStats?.totalWins)}\n`;
    shareText += `Total Games Played: ${safeNum(allTimeStats?.totalGamesPlayed)}\n`;
    shareText += `Total Moves: ${safeNum(allTimeStats?.totalMovesUsed)}\n`;
    shareText += `Total Hints: ${safeNum(allTimeStats?.totalHintsUsed)}\n\n`;
    shareText += `First Try Streak: ${safeNum(allTimeStats?.firstTryStreak)}\n`;
    shareText += `Longest First Try: ${safeNum(allTimeStats?.longestFirstTryStreak)}\n\n`;

    shareText += `Play at: ${window.location.origin}`;
    return shareText;
  }, [allTimeStats, todayKey]); // Depend on allTimeStats

  const formattedShareText = getFormattedShareText();
  const shareTitle = "Color Lock - Game Statistics";
  const shareUrl = window.location.href;
  
  // --- Sharing Handlers (using formattedShareText) ---
   const handleWebShare = useCallback(async () => { // Wrap in useCallback
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: formattedShareText });
      } catch (err) { console.error('Error sharing:', err); }
    } else {
      handleCopyToClipboard(); // Fallback
    }
  }, [formattedShareText, shareTitle]); // Dependencies

  const handleTwitterShare = useCallback(() => { // Wrap in useCallback
    const text = encodeURIComponent(formattedShareText);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(shareUrl)}`, '_blank');
  }, [formattedShareText, shareUrl]); // Dependencies

  const handleFacebookShare = useCallback(() => { // Wrap in useCallback
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}"e=${encodeURIComponent(formattedShareText)}`, '_blank');
  }, [formattedShareText, shareUrl]); // Dependencies

  const handleEmailShare = useCallback(() => { // Wrap in useCallback
    window.location.href = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(formattedShareText)}`;
  }, [formattedShareText, shareTitle]); // Dependencies

  const handleCopyToClipboard = useCallback(() => { // Wrap in useCallback
    navigator.clipboard.writeText(formattedShareText).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }).catch(err => console.error('Could not copy text: ', err));
  }, [formattedShareText]); // Dependency

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content stats-modal">
        <button className="close-button" onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faXmark} />
        </button>
        
        <div className="modal-header">
          <h2 className="modal-title">Statistics</h2>
        </div>
        
        {isLoading ? (
          // Loading state
          <div className="stats-loading">
            <div className="spinner"></div>
            <p>Loading statistics...</p>
          </div>
        ) : (
          // Stats content when loaded
          <>
            <div className="stats-section">
              <h3>Today's Game ({todayKey})</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.bestScoresByDay, 'bestScoreToday')}</div>
                  <div className="stat-label">Best Score</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.attemptsPerDay?.[todayKey], 'number')}</div>
                  <div className="stat-label">Attempts</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.winsPerDay?.[todayKey], 'number')}</div>
                  <div className="stat-label">Wins Today</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.hintUsageByDay?.[todayKey], 'number')}</div>
                  <div className="stat-label">Hints Today</div>
                </div>
              </div>
            </div>
            
            <div className="stats-section">
              <h3>All-time Stats</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.currentStreak, 'number')}</div>
                  <div className="stat-label">Current Streak</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.longestStreak, 'number')}</div>
                  <div className="stat-label">Longest Streak</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.playedDays, 'arrayLength')}</div>
                  <div className="stat-label">Days Played</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.goalAchievedDays, 'arrayLength')}</div>
                  <div className="stat-label">Goals Achieved</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.totalWins, 'number')}</div>
                  <div className="stat-label">Total Wins</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.totalGamesPlayed, 'number')}</div>
                  <div className="stat-label">Total Games</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.totalMovesUsed, 'number')}</div>
                  <div className="stat-label">Total Moves</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.totalHintsUsed, 'number')}</div>
                  <div className="stat-label">Total Hints</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.firstTryStreak, 'number')}</div>
                  <div className="stat-label">First Try Streak</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{safelyDisplay(allTimeStats?.longestFirstTryStreak, 'number')}</div>
                  <div className="stat-label">Longest 1st Try</div>
                </div>
              </div>
            </div>
            
            <div className="share-section">
              <p>Share your statistics:</p>
              <div className="social-buttons">
                <button 
                  className="social-button twitter-button" 
                  onClick={handleTwitterShare}
                  aria-label="Share to Twitter"
                >
                  <FontAwesomeIcon icon={faTwitter} />
                </button>
                <button 
                  className="social-button facebook-button" 
                  onClick={handleFacebookShare}
                  aria-label="Share to Facebook"
                >
                  <FontAwesomeIcon icon={faFacebookF} />
                </button>
                <button 
                  className="social-button email-button" 
                  onClick={handleEmailShare}
                  aria-label="Share via Email"
                >
                  <FontAwesomeIcon icon={faEnvelope} />
                </button>
                <button 
                  className="social-button copy-button" 
                  onClick={handleCopyToClipboard}
                  aria-label="Copy to Clipboard"
                >
                  <FontAwesomeIcon icon={faCopy} />
                  {copySuccess && <span className="copy-success-tooltip">Copied!</span>}
                </button>
                {isWebShareSupported && (
                  <button 
                    className="social-button web-share-button" 
                    onClick={handleWebShare}
                    aria-label="Share"
                  >
                    <FontAwesomeIcon icon={faShare} />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

// Add displayName property
StatsModal.displayName = 'StatsModal';

export default StatsModal; 