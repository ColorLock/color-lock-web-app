import React, { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faTrophy, faTimes, faInfoCircle, faHome } from '@fortawesome/free-solid-svg-icons';
import { TileColor, DailyPuzzle } from '../types';
import { AppSettings } from '../types/settings';
import { useTutorialContext } from '../contexts/TutorialContext';

interface GameHeaderProps {
  puzzle: DailyPuzzle;
  getColorCSS: (color: TileColor) => string;
  onSettingsClick: () => void;
  onStatsClick: () => void;
  onHintClick: () => void;
  onInfoClick: () => void;
  onHomeClick: () => void;
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  puzzle,
  getColorCSS,
  onSettingsClick,
  onStatsClick,
  onHintClick,
  onInfoClick,
  onHomeClick
}) => {
  const { isTutorialMode, showHintButton } = useTutorialContext();
  
  return (
    <>
      {/* Home Button */}
      <button className="home-button" onClick={onHomeClick} aria-label="Home">
        <FontAwesomeIcon icon={faHome} />
      </button>

      {/* Settings Button */}
      <button className="settings-button" onClick={onSettingsClick} aria-label="Settings">
        <FontAwesomeIcon icon={faGear} />
      </button>

      {/* Stats Button */}
      <button className="stats-button" onClick={onStatsClick} aria-label="Statistics">
        <FontAwesomeIcon icon={faTrophy} />
      </button>

      {/* Info Button */}
      <button className="info-button" onClick={onInfoClick} aria-label="Tutorial">
        <FontAwesomeIcon icon={faInfoCircle} />
      </button>

      {/* Top info card */}
      <div className="top-card">
        <h1 style={{ color: isTutorialMode ? 'red' : 'inherit' }}>
          {isTutorialMode ? 'Tutorial' : 'Color Lock'}
        </h1>
        <div className="target-row">
          <span>Target:</span>
          <div 
            className="target-circle" 
            style={{ backgroundColor: puzzle.targetColor ? getColorCSS(puzzle.targetColor) : '#ffffff' }} 
          />
        </div>
        <div className="goal-row">
          <span>Goal: {puzzle.algoScore}</span>
          <span>Moves: {puzzle.userMovesUsed}</span>
        </div>
        {/* Only show hint button if not in tutorial mode or if showHintButton is true */}
        {(!isTutorialMode || showHintButton) && (
          <button className="hint-button" onClick={onHintClick}>Get Hint</button>
        )}
      </div>
    </>
  );
};

interface GameFooterProps {
  puzzle: DailyPuzzle;
  settings: AppSettings;
  getLockedColorCSS: () => string;
  getLockedRegionSize: () => number;
  onTryAgain: () => void;
}

export const GameFooter: React.FC<GameFooterProps> = ({
  puzzle,
  settings,
  getLockedColorCSS,
  getLockedRegionSize,
  onTryAgain
}) => {
  const { isTutorialMode, showTryAgainButton } = useTutorialContext();
  
  return (
    <div className="controls-container">
      <div className="controls-inner">
        {/* Locked region indicator with updated styling */}
        {settings.showLockedRegionCounter && (
          <div className="locked-region-counter">
            <span className="locked-label game-title-font">Locked Squares:</span>
            <span 
              className="locked-count"
              style={{ 
                color: getLockedColorCSS(),
                textShadow: '-0.5px -0.5px 0 #000, 0.5px -0.5px 0 #000, -0.5px 0.5px 0 #000, 0.5px 0.5px 0 #000',
                fontSize: '22px'
              }}
            >
              {getLockedRegionSize()}
            </span>
          </div>
        )}
        
        {/* Try Again button - only show if not in tutorial mode or if showTryAgainButton is true */}
        {(!isTutorialMode || showTryAgainButton) && (
          <button 
            className="try-again-button" 
            onClick={onTryAgain}
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
};

// Original GameControls for backward compatibility
interface GameControlsProps {
  puzzle: DailyPuzzle;
  settings: AppSettings;
  getColorCSS: (color: TileColor) => string;
  getLockedColorCSS: () => string;
  getLockedRegionSize: () => number;
  onTryAgain: () => void;
  onSettingsClick: () => void;
  onStatsClick: () => void;
  onHintClick: () => void;
  onInfoClick: () => void;
  onHomeClick: () => void;
}

const GameControls: React.FC<GameControlsProps> = (props) => {
  return (
    <>
      <GameHeader 
        puzzle={props.puzzle}
        getColorCSS={props.getColorCSS}
        onSettingsClick={props.onSettingsClick}
        onStatsClick={props.onStatsClick}
        onHintClick={props.onHintClick}
        onInfoClick={props.onInfoClick}
        onHomeClick={props.onHomeClick}
      />
      <GameFooter
        puzzle={props.puzzle}
        settings={props.settings}
        getLockedColorCSS={props.getLockedColorCSS}
        getLockedRegionSize={props.getLockedRegionSize}
        onTryAgain={props.onTryAgain}
      />
    </>
  );
};

export default GameControls; 