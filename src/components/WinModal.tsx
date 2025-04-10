import React, { useState, useEffect, useContext } from 'react';
import ReactConfetti from 'react-confetti';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faCopy, faEnvelope, faShare } from '@fortawesome/free-solid-svg-icons';
import { faTwitter, faFacebookF } from '@fortawesome/free-brands-svg-icons';
import { DailyPuzzle, TileColor } from '../types';
import { tileColorToName } from '../utils/shareUtils';
import { SettingsContext } from '../App';
import { useGameContext } from '../contexts/GameContext';
import { useTutorialContext } from '../contexts/TutorialContext';
import { dateKeyForToday } from '../utils/dateUtils';
import { defaultStats } from '../types/stats';

interface WinModalProps {
  puzzle: DailyPuzzle;
  onTryAgain: () => void;
  onClose: () => void;
  getColorCSS: (color: TileColor) => string;
  generateShareText: () => string;
  setShowWinModal: (show: boolean) => void;
  shareToTwitter: () => void;
  shareToFacebook: () => void;
  copyToClipboard: (text: string) => void;
}

const WinModal: React.FC<WinModalProps> = ({ 
  puzzle, 
  onTryAgain, 
  onClose, 
  getColorCSS, 
  generateShareText,
  setShowWinModal,
  shareToTwitter: parentShareToTwitter,
  shareToFacebook: parentShareToFacebook,
  copyToClipboard: parentCopyToClipboard
}) => {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [windowDimensions, setWindowDimensions] = useState<{width: number, height: number}>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [confettiActive, setConfettiActive] = useState<boolean>(true);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [isWebShareSupported, setIsWebShareSupported] = useState<boolean>(false);
  
  // Get tutorial context
  const { isTutorialMode, nextStep, endTutorial } = useTutorialContext();
  
  // Get game context to access stats
  const { gameStats } = useGameContext();

  // Get settings for sound playback
  const settings = useContext(SettingsContext);
  const soundEnabled = settings?.enableSoundEffects || false;

  // Use defaultStats if gameStats is somehow null/undefined
  const currentStats = gameStats || defaultStats;
  const allTimeStats = currentStats.allTimeStats || defaultStats.allTimeStats;
  
  // Get today's date key
  const todayKey = dateKeyForToday();
  
  // Get attempts for today from allTimeStats
  const attemptsToday = allTimeStats.attemptsPerDay?.[todayKey] ?? 1; // Default to 1 if not found

  // Check if Web Share API is supported
  useEffect(() => {
    setIsWebShareSupported(typeof navigator.share === 'function');
  }, []);

  // Play celebration sound once
  useEffect(() => {
    if (soundEnabled) {
      const audio = new Audio('/sounds/win-celebration.mp3');
      audio.volume = 0.5;
      audio.play().catch(err => console.warn('Could not play sound:', err));
    }
    
    // Setup window resize listener for confetti
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    
    // Stop confetti after some time
    const timer = setTimeout(() => {
      setConfettiActive(false);
    }, 5000);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [soundEnabled]);

  // Timer countdown effect
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      const secs = Math.floor(diff / 1000);
      const hrs = Math.floor(secs / 3600);
      const mins = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setTimeLeft(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Get color name for display
  const colorName = tileColorToName(puzzle.targetColor);

  // Calculate if the user beat the optimal solution
  const beatOptimal = puzzle.userMovesUsed <= puzzle.algoScore;
  
  // Format the date for the share text
  const formatDate = () => {
    const now = new Date();
    return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
  };
  
  // Helper to convert tile colors to emoji
  const getTileEmoji = (color: TileColor): string => {
    switch (color) {
      case 'red': return '🟥';
      case 'blue': return '🟦';
      case 'green': return '🟩';
      case 'yellow': return '🟨';
      case 'purple': return '🟪';
      case 'orange': return '🟧';
      default: return '⬜';
    }
  };
  
  // Generate properly formatted share text
  const getFormattedShareText = () => {
    // Get the emoji representation directly from the puzzle's starting grid
    const boardRows = puzzle.startingGrid.map(row => 
      row.map(color => getTileEmoji(color)).join("")
    ).join("\n");
    
    // Create formatted text that matches the required format
    return `Color Lock - ${formatDate()}
Target: ${getTileEmoji(puzzle.targetColor)}

Score: ${puzzle.userMovesUsed} moves${beatOptimal ? ' 🏅' : ''}

Today's Board:
${boardRows}`;
  };
  
  // Get the properly formatted share text
  const formattedShareText = getFormattedShareText();
  const shareTitle = `Color Lock - Daily Puzzle`;
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

  // Handlers for sharing
  const handleTwitterShare = () => {
    parentShareToTwitter();
  };

  const handleFacebookShare = () => {
    parentShareToFacebook();
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(shareTitle);
    const body = encodeURIComponent(formattedShareText);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

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

  // Handle try again button
  const handleTryAgainOrContinue = () => {
    if (isTutorialMode) {
      // In tutorial mode, end the tutorial
      endTutorial();
      onClose();
    } else {
      // In regular mode, just try again
      onTryAgain();
    }
  };

  return (
    <div className="modal-backdrop">
      {confettiActive && (
        <ReactConfetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          recycle={false}
          numberOfPieces={350}
          gravity={0.15}
          initialVelocityY={20}
          colors={['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']}
        />
      )}
      
      <div className="win-modal win-modal-animated">
        <h2 className="congratulations-title">Congratulations!</h2>
        
        <div className="unlocked-message">
          Unlocked <span className="color-name" style={{color: getColorCSS(puzzle.targetColor)}}>{colorName}</span> in <strong>{puzzle.userMovesUsed}</strong> moves!
          {beatOptimal && <span className="optimal-badge">🏅</span>}
        </div>
        
        <div className="win-stats">
          <div className="stat-item">
            <div className="stat-value">{puzzle.algoScore}</div>
            <div className="stat-label">Bot Moves</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{attemptsToday}</div>
            <div className="stat-label">Times Played</div>
          </div>
        </div>
        
        {!isTutorialMode && (
          <div className="next-puzzle-timer">
            <p>New Puzzle in:</p>
            <div className="timer">
              {timeLeft.split(':').map((unit, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <span className="time-separator">:</span>}
                  <span className="time-unit">{unit}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
        
        <div className="share-section">
          <p>Share your results:</p>
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
        
        <div className="win-actions">
          <button 
            className="try-again-button"
            onClick={handleTryAgainOrContinue}
          >
            {isTutorialMode ? "Play Today's Puzzle" : "Play Again"}
          </button>
          
          <button className="close-button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default WinModal; 