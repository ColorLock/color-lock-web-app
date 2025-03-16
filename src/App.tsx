import React, { useState, useEffect, createContext, useContext } from 'react';
import './scss/main.scss';
import ReactConfetti from 'react-confetti';

// Types
import { AppSettings } from './types/settings';

// Components
import ColorPickerModal from './components/ColorPickerModal';
import WinModal from './components/WinModal';
import SettingsModal from './components/SettingsModal';
import StatsModal from './components/StatsModal';
import GameGrid from './components/GameGrid';
import { GameHeader, GameFooter } from './components/GameControls';
import AutocompleteModal from './components/AutocompleteModal';
import LostGameModal from './components/LostGameModal';

// Utils
import { generateShareText, shareToTwitter, shareToFacebook, copyToClipboard } from './utils/shareUtils';

// Context
import { GameProvider, useGameContext } from './contexts/GameContext';

// Extend CSSProperties to include our custom properties
declare module 'react' {
  interface CSSProperties {
    '--current-color'?: string;
    '--target-color'?: string;
  }
}

// Create settings context
export const SettingsContext = createContext<AppSettings | null>(null);

const GameContainer = () => {
  const {
    puzzle,
    settings,
    loading,
    error,
    handleTileClick,
    handleColorSelect,
    closeColorPicker,
    handleTryAgain,
    resetLostState,
    handleHint,
    handleSettingsChange,
    getColorCSSWithSettings,
    getLockedRegionSize,
    getLockedColorCSSWithSettings,
    hintCell,
    showColorPicker,
    selectedTile,
    showWinModal,
    showSettings,
    showStats,
    gameStats,
    setShowSettings,
    setShowStats,
    setShowWinModal,
    shareGameStats,
    showAutocompleteModal,
    setShowAutocompleteModal,
    handleAutoComplete
  } = useGameContext();

  const [windowDimensions, setWindowDimensions] = useState<{width: number, height: number}>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  
  const [confettiActive, setConfettiActive] = useState<boolean>(false);
  const [showAppContent, setShowAppContent] = useState<boolean>(false);
  const [loadingAnimationComplete, setLoadingAnimationComplete] = useState<boolean>(false);

  // Update window dimensions for confetti
  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Show confetti when the game is solved
  useEffect(() => {
    if (puzzle?.isSolved) {
      setConfettiActive(true);
      const timer = setTimeout(() => {
        setConfettiActive(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [puzzle?.isSolved]);

  // Control loading animation and app content fade-in
  useEffect(() => {
    if (!loading && puzzle) {
      // Set a timer for the logo animation to complete (3 seconds)
      const animationTimer = setTimeout(() => {
        setLoadingAnimationComplete(true);
      }, 3000);
      
      // Set a timer for the app content to fade in (after 4.5 seconds total)
      const contentTimer = setTimeout(() => {
        setShowAppContent(true);
      }, 4500);
      
      return () => {
        clearTimeout(animationTimer);
        clearTimeout(contentTimer);
      };
    }
    
    // Reset states when loading changes
    if (loading) {
      setLoadingAnimationComplete(false);
      setShowAppContent(false);
    }
    
    return undefined;
  }, [loading, puzzle]);

  if (loading || !showAppContent || !puzzle) {
    return (
      <div className="loading-container">
        <div className={`logo-animation ${loadingAnimationComplete ? 'fade-out' : ''}`}>
          <img src="/tbs_logo.png" alt="The Banana Standard" className="loading-logo" />
        </div>
        {loadingAnimationComplete && !showAppContent && (
          <div className="app-fade-in-placeholder" />
        )}
      </div>
    );
  }

  // Determine additional container classes based on settings
  const containerClasses = ['container', 'app-fade-in'];
  if (settings.highContrastMode) {
    containerClasses.push('high-contrast-mode');
  }
  if (!settings.enableAnimations) {
    containerClasses.push('no-animations');
  }

  return (
    <div className={containerClasses.join(' ')}>
      {/* Confetti for win celebration */}
      {confettiActive && (
        <ReactConfetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          recycle={false}
          numberOfPieces={500}
        />
      )}

      {/* Game Header */}
      <GameHeader 
        puzzle={puzzle}
        getColorCSS={getColorCSSWithSettings}
        onSettingsClick={() => setShowSettings(true)}
        onStatsClick={() => setShowStats(true)}
        onHintClick={handleHint}
      />

      {/* Game Grid */}
      <GameGrid 
        grid={puzzle.grid}
        lockedCells={puzzle.lockedCells}
        hintCell={hintCell}
        settings={settings}
        onTileClick={handleTileClick}
        getColorCSS={getColorCSSWithSettings}
      />

      {/* Game Footer (now below the grid) */}
      <GameFooter
        puzzle={puzzle}
        settings={settings}
        getLockedColorCSS={getLockedColorCSSWithSettings}
        getLockedRegionSize={getLockedRegionSize}
        onTryAgain={handleTryAgain}
      />

      {/* Color Picker Modal */}
      {showColorPicker && selectedTile && (
        <ColorPickerModal 
          onSelect={handleColorSelect} 
          onCancel={closeColorPicker} 
          getColorCSS={getColorCSSWithSettings}
          currentColor={puzzle.grid[selectedTile.row][selectedTile.col]} 
        />
      )}

      {/* Autocomplete Modal */}
      {showAutocompleteModal && puzzle && (
        <AutocompleteModal
          isOpen={showAutocompleteModal}
          onClose={() => setShowAutocompleteModal(false)}
          onAutoComplete={handleAutoComplete}
          targetColor={puzzle.targetColor}
          getColorCSS={getColorCSSWithSettings}
        />
      )}

      {/* Lost Game Modal */}
      {puzzle.isLost && (
        <LostGameModal
          isOpen={puzzle.isLost}
          targetColor={puzzle.targetColor}
          getColorCSS={getColorCSSWithSettings}
          onClose={resetLostState}
          onTryAgain={handleTryAgain}
        />
      )}

      {/* Win Modal */}
      {showWinModal && (
        <WinModal 
          puzzle={puzzle} 
          onTryAgain={handleTryAgain} 
          onClose={() => setShowWinModal(false)}
          getColorCSS={getColorCSSWithSettings}
          shareToTwitter={() => shareToTwitter(generateShareText(puzzle))}
          shareToFacebook={() => shareToFacebook(generateShareText(puzzle))}
          copyToClipboard={(text) => copyToClipboard(text)}
          generateShareText={() => generateShareText(puzzle)}
          setShowWinModal={setShowWinModal}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />

      {/* Stats Modal */}
      <StatsModal 
        isOpen={showStats}
        onClose={() => setShowStats(false)}
        stats={gameStats}
        onShareStats={shareGameStats}
      />

      {/* Error display */}
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <GameProvider>
      <GameContainer />
    </GameProvider>
  );
};

export default App;