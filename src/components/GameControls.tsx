import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faTrophy, faInfoCircle, faHome, faBrain } from '@fortawesome/free-solid-svg-icons';
import { TileColor, DailyPuzzle } from '../types';
import { AppSettings, DifficultyLevel } from '../types/settings';
import { useTutorialContext } from '../contexts/TutorialContext';
import HamburgerMenu from './HamburgerMenu';
import SignUpButton from './SignUpButton';

// Updated GameHeader Props to include menu state/handlers
interface GameHeaderProps {
  puzzle: DailyPuzzle;
  settings: AppSettings;
  getColorCSS: (color: TileColor) => string;
  onHintClick: () => void;
  showHintButton?: boolean;
  // Hamburger Menu Props
  isMenuOpen?: boolean;
  toggleMenu?: () => void;
  isGuest?: boolean;
  onHomeClick?: () => void;
  onSettingsClick?: () => void;
  onStatsClick?: () => void;
  onInfoClick?: () => void;
  // Add callback for difficulty change
  onDifficultyChange?: (difficulty: DifficultyLevel) => void;
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  puzzle,
  settings = {} as AppSettings,
  getColorCSS,
  onHintClick,
  showHintButton = true,
  // Destructure menu props with defaults
  isMenuOpen = false,
  toggleMenu = () => {},
  isGuest = false,
  onHomeClick = () => {},
  onSettingsClick = () => {},
  onStatsClick = () => {},
  onInfoClick = () => {},
  // Destructure difficulty change callback
  onDifficultyChange = () => {}
}) => {
  const { isTutorialMode } = useTutorialContext();
  
  // Use the difficulty level from settings with a fallback to prevent errors
  const currentDifficulty = settings?.difficultyLevel || DifficultyLevel.Medium;
  
  // Handle difficulty column click
  const handleDifficultyClick = (difficulty: DifficultyLevel) => {
    onDifficultyChange(difficulty);
  };
  
  return (
    <div className="top-card">
      {/* Hamburger Menu Wrapper (Mobile Only) */}
      <div className="hamburger-wrapper mobile-only-hamburger">
        <HamburgerMenu isOpen={isMenuOpen} onToggle={toggleMenu}>
          {/* Pass actions directly to menu items */}
          <button className="hamburger-menu-item" onClick={onHomeClick}>
            <FontAwesomeIcon icon={faHome} /> Home
          </button>
          <button className="hamburger-menu-item" onClick={onSettingsClick}>
            <FontAwesomeIcon icon={faGear} /> Settings
          </button>
          <button className="hamburger-menu-item" onClick={onStatsClick}>
            <FontAwesomeIcon icon={faTrophy} /> Stats
          </button>
          <button className="hamburger-menu-item" onClick={onInfoClick}>
            <FontAwesomeIcon icon={faInfoCircle} /> Tutorial
          </button>
          {isGuest && (
            <div className="hamburger-menu-item-signup">
              {/* Pass toggleMenu to onClose if needed */}
              <SignUpButton onClose={toggleMenu} />
            </div>
          )}
        </HamburgerMenu>
      </div>

      {/* Difficulty Indicator (Desktop/Tablet) */}
      {/* Only show outside tutorial mode */}
      {!isTutorialMode && (
        <div className={`difficulty-indicator-container difficulty-${currentDifficulty}`}>
          <span className="difficulty-text">difficulty</span>
          <div className="difficulty-columns">
            <button 
              className="difficulty-column easy"
              title="Set to Easy Difficulty"
              aria-label={`Difficulty: Easy ${currentDifficulty === DifficultyLevel.Easy ? '(Active)' : '(Inactive)'}`}
              onClick={() => handleDifficultyClick(DifficultyLevel.Easy)}
            ></button>
            <button 
              className="difficulty-column medium"
              title="Set to Medium Difficulty"
              aria-label={`Difficulty: Medium ${currentDifficulty === DifficultyLevel.Medium ? '(Active)' : '(Inactive)'}`}
              onClick={() => handleDifficultyClick(DifficultyLevel.Medium)}
            ></button>
            <button 
              className="difficulty-column hard"
              title="Set to Hard Difficulty"
              aria-label={`Difficulty: Hard ${currentDifficulty === DifficultyLevel.Hard ? '(Active)' : '(Inactive)'}`}
              onClick={() => handleDifficultyClick(DifficultyLevel.Hard)}
            ></button>
          </div>
        </div>
      )}

      {/* Top Card Content */}
      <div className="top-card-content">
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
        {showHintButton && (
          <button className="hint-button" onClick={onHintClick}>Get Hint</button>
        )}
      </div>
    </div>
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

// Updated GameControls Props to include menu props
interface GameControlsProps {
  puzzle: DailyPuzzle;
  settings: AppSettings;
  getColorCSS: (color: TileColor) => string;
  getLockedColorCSS: () => string;
  getLockedRegionSize: () => number;
  onTryAgain: () => void;
  onHintClick: () => void;
  // Add menu props if GameControls is the direct parent managing state
  isMenuOpen?: boolean;
  toggleMenu?: () => void;
  isGuest?: boolean;
  onHomeClick?: () => void;
  onSettingsClick?: () => void;
  onStatsClick?: () => void;
  onInfoClick?: () => void;
  // Add difficulty change handler
  onDifficultyChange?: (difficulty: DifficultyLevel) => void;
}

const GameControls: React.FC<GameControlsProps> = (props) => {
  const { isTutorialMode, showHintButton } = useTutorialContext();

  return (
    <>
      <GameHeader 
        puzzle={props.puzzle}
        settings={props.settings}
        getColorCSS={props.getColorCSS}
        onHintClick={props.onHintClick}
        showHintButton={!isTutorialMode || showHintButton}
        isMenuOpen={props.isMenuOpen}
        toggleMenu={props.toggleMenu}
        isGuest={props.isGuest}
        onHomeClick={props.onHomeClick}
        onSettingsClick={props.onSettingsClick}
        onStatsClick={props.onStatsClick}
        onInfoClick={props.onInfoClick}
        onDifficultyChange={props.onDifficultyChange}
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