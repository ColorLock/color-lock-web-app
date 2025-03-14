import React, { useState, useEffect, useContext } from 'react';
import ReactConfetti from 'react-confetti';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faCopy } from '@fortawesome/free-solid-svg-icons';
import { faTwitter, faFacebookF } from '@fortawesome/free-brands-svg-icons';
import { DailyPuzzle, TileColor } from '../types';
import { tileColorToName, copyToClipboard, shareToTwitter, shareToFacebook } from '../utils/shareUtils';
import { SettingsContext } from '../App';

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
  shareToTwitter,
  shareToFacebook,
  copyToClipboard
}) => {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [windowDimensions, setWindowDimensions] = useState<{width: number, height: number}>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [confettiActive, setConfettiActive] = useState<boolean>(true);
  const [showShareButtons, setShowShareButtons] = useState<boolean>(false);

  // Get settings for sound playback
  const settings = useContext(SettingsContext);
  const soundEnabled = settings?.enableSoundEffects || false;
  
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
      if (secs <= 0) {
        onTryAgain();
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [onTryAgain]);

  // Get color name for display
  const colorName = tileColorToName(puzzle.targetColor);

  // Calculate if the user beat the optimal solution
  const beatOptimal = puzzle.userMovesUsed <= puzzle.algoScore;
  
  // Generate share text
  const shareText = generateShareText();

  // Handle share button click
  const handleShareClick = () => {
    setShowShareButtons(!showShareButtons);
  };

  // Handlers for sharing
  const handleTwitterShare = () => shareToTwitter();
  const handleFacebookShare = () => shareToFacebook();
  const handleCopyToClipboard = () => copyToClipboard(shareText);

  return (
    <div className="modal-backdrop">
      {confettiActive && (
        <ReactConfetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          recycle={true}
          numberOfPieces={250}
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
            <div className="stat-label">Optimal Moves</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{puzzle.timesPlayed}</div>
            <div className="stat-label">Times Played</div>
          </div>
        </div>
        
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
        
        <div className="share-section">
          <button className="share-button" onClick={handleShareClick}>
            Share
          </button>
          
          {showShareButtons && (
            <div className="share-options">
              <span className="share-on">Share on:</span>
              <div className="social-buttons">
                <button className="social-button twitter-button" onClick={handleTwitterShare}>
                  <FontAwesomeIcon icon={faTwitter} />
                </button>
                <button className="social-button facebook-button" onClick={handleFacebookShare}>
                  <FontAwesomeIcon icon={faFacebookF} />
                </button>
                <button className="social-button clipboard-button" onClick={handleCopyToClipboard}>
                  <FontAwesomeIcon icon={faCopy} />
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-buttons">
          <button className="try-again-modal-button" onClick={() => {
            onTryAgain();
            setShowWinModal(false);
          }}>Try Again</button>
          <button className="close-button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default WinModal; 