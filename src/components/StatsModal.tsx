import React, { useState, useEffect } from 'react';
import '../scss/main.scss';
import { TileColor } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faShareNodes, faCopy, faEnvelope, faShare } from '@fortawesome/free-solid-svg-icons';
import { faTwitter, faFacebookF } from '@fortawesome/free-brands-svg-icons';
import { GameStatistics } from '../types/stats';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: GameStatistics;
  onShareStats: () => void;
}

const StatsModal: React.FC<StatsModalProps> = ({ 
  isOpen, 
  onClose, 
  stats, 
  onShareStats 
}) => {
  if (!isOpen) return null;
  
  // State for sharing functionality
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [isWebShareSupported, setIsWebShareSupported] = useState<boolean>(false);
  
  // Check if Web Share API is supported
  useEffect(() => {
    setIsWebShareSupported(typeof navigator.share === 'function');
  }, []);
  
  // Helper to safely display numeric values (handle undefined, NaN, etc.)
  const safelyDisplayNumber = (value: number | null | undefined): string | number => {
    if (value === null || value === undefined || isNaN(Number(value))) {
      return 0;
    }
    return value;
  };
  
  // Generate formatted share text
  const getFormattedShareText = () => {
    // Get safe values for stats
    const safeTotalMoves = safelyDisplayNumber(stats.allTimeStats.totalMoves);
    const safeDaysPlayed = safelyDisplayNumber(stats.allTimeStats.daysPlayed);
    const safeGoalAchieved = safelyDisplayNumber(stats.allTimeStats.goalAchieved);
    const safeStreak = safelyDisplayNumber(stats.allTimeStats.streak);
    const bestScoreDisplay = stats.todayStats.bestScore !== null ? stats.todayStats.bestScore : 'n/a';
    
    return `🔒 Color Lock Stats 🔒\n
Today's Game:
Best Score: ${bestScoreDisplay}
Times Played: ${safelyDisplayNumber(stats.todayStats.timesPlayed)}

All-time Stats:
Streak: ${safeStreak}
Days Played: ${safeDaysPlayed}
Goals Achieved: ${safeGoalAchieved}
Total Moves: ${safeTotalMoves}

Play at: https://colorlock.game`;
  };
  
  const formattedShareText = getFormattedShareText();
  const shareTitle = "Color Lock - Game Statistics";
  const shareUrl = window.location.href;
  
  // Handler for Web Share API
  const handleWebShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: formattedShareText,
        });
        console.log('Shared successfully');
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      // Fallback for browsers that don't support Web Share API
      handleCopyToClipboard();
    }
  };
  
  // Handle sharing to Twitter
  const handleTwitterShare = () => {
    const text = encodeURIComponent(formattedShareText);
    const url = encodeURIComponent(shareUrl);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
  };
  
  // Handle sharing to Facebook
  const handleFacebookShare = () => {
    const url = encodeURIComponent(shareUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
  };
  
  // Handle sharing via email
  const handleEmailShare = () => {
    const subject = encodeURIComponent(shareTitle);
    const body = encodeURIComponent(formattedShareText);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };
  
  // Handle copying to clipboard
  const handleCopyToClipboard = () => {
    // Use a temporary textarea element for better cross-browser compatibility
    const textArea = document.createElement('textarea');
    textArea.value = formattedShareText;
    textArea.style.position = 'fixed';  // Make the textarea out of the viewport
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }
    } catch (err) {
      console.error('Could not copy text: ', err);
    }
    
    document.body.removeChild(textArea);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content stats-modal">
        <button className="close-button" onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faXmark} />
        </button>
        
        <div className="modal-header">
          <h2 className="modal-title">Statistics</h2>
        </div>
        
        <div className="stats-section">
          <h3>Today's Game</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{stats.todayStats.bestScore !== null ? stats.todayStats.bestScore : 'n/a'}</div>
              <div className="stat-label">Best Score</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{safelyDisplayNumber(stats.todayStats.timesPlayed)}</div>
              <div className="stat-label">Times Played</div>
            </div>
          </div>
        </div>
        
        <div className="stats-section">
          <h3>All-time Stats</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{safelyDisplayNumber(stats.allTimeStats.streak)}</div>
              <div className="stat-label">Streak</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{safelyDisplayNumber(stats.allTimeStats.daysPlayed)}</div>
              <div className="stat-label">Days Played</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{safelyDisplayNumber(stats.allTimeStats.goalAchieved)}</div>
              <div className="stat-label">Goals Achieved</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{safelyDisplayNumber(stats.allTimeStats.totalMoves)}</div>
              <div className="stat-label">Total Moves</div>
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
              className="social-button clipboard-button" 
              onClick={handleCopyToClipboard}
              aria-label="Copy to clipboard"
            >
              <FontAwesomeIcon icon={faCopy} />
              {copySuccess && <span className="copy-success-tooltip">Copied!</span>}
            </button>
            {isWebShareSupported && (
              <button 
                className="social-button web-share-button" 
                onClick={handleWebShare}
                aria-label="Share using device options"
              >
                <FontAwesomeIcon icon={faShare} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsModal; 