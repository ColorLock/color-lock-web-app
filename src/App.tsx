import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import './scss/main.scss';
import ReactConfetti from 'react-confetti';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHome, faGear, faTrophy, faInfoCircle } from '@fortawesome/free-solid-svg-icons';

// Types
import { AppSettings, DifficultyLevel } from './types/settings';
import { TileColor } from './types';

// Components
import ColorPickerModal from './components/ColorPickerModal';
import WinModal from './components/WinModal';
import SettingsModal from './components/SettingsModal';
import StatsModal from './components/StatsModal';
import GameGrid from './components/GameGrid';
import { GameHeader, GameFooter } from './components/GameControls';
import AutocompleteModal from './components/AutocompleteModal';
import LostGameModal from './components/LostGameModal';
import TutorialModal from './components/TutorialModal';
import TutorialOverlay from './components/TutorialOverlay';
import TutorialHighlight from './components/TutorialHighlight';
import TutorialWarningModal from './components/TutorialWarningModal';
import LandingScreen from './components/LandingScreen';
import SignUpButton from './components/SignUpButton';
import HamburgerMenu from './components/HamburgerMenu';
import UsageStatsScreen from './components/UsageStatsScreen';

// Utils
import { generateShareText, shareToTwitter, shareToFacebook, copyToClipboard } from './utils/shareUtils';
import { getLockedColorCSS } from './utils/colorUtils';

// Context
import { GameProvider, useGameContext } from './contexts/GameContext';
import { TutorialProvider, useTutorialContext, TutorialStep } from './contexts/TutorialContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataCacheProvider, useDataCache } from './contexts/DataCacheContext';

// Create a context for navigating between screens
type ScreenType = 'landing' | 'game' | 'usageStats';

interface NavigationContextType {
  showLandingPage: boolean;
  setShowLandingPage: (show: boolean) => void;
  currentScreen: ScreenType;
  navigateToScreen: (screen: ScreenType) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

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
  const { showLandingPage, setShowLandingPage } = useNavigation();

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
    handleAutoComplete,
    navigateToHome,
    isLoadingStats
  } = useGameContext();

  // Tutorial context
  const {
    isTutorialMode,
    currentStep,
    tutorialBoard,
    isBoardFading,
    waitingForUserAction,
    showTutorialModal,
    setShowTutorialModal,
    handleTileClick: handleTutorialTileClick,
    handleColorSelect: handleTutorialColorSelect,
    closeColorPicker: closeTutorialColorPicker,
    showColorPicker: showTutorialColorPicker,
    suggestedTile,
    lockedCells: tutorialLockedCells,
    getCurrentStepConfig,
    showWarningModal,
    closeWarningModal,
    currentMoveIndex,
    showHintButton
  } = useTutorialContext();

  // Auth context
  const { isGuest } = useAuth();

  // Hamburger Menu State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const handleMenuItemClick = (action: () => void) => {
    action();
    setIsMenuOpen(false);
  };

  const [windowDimensions, setWindowDimensions] = useState<{width: number, height: number}>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  
  const [confettiActive, setConfettiActive] = useState<boolean>(false);

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

  // Handle home navigation - modify to use context
  const handleHomeClick = () => {
    setShowLandingPage(true);
  };

  // Define button action handlers
  const handleSettingsClickAction = () => setShowSettings(true);
  const handleStatsClickAction = () => setShowStats(true);
  const handleInfoClickAction = () => setShowTutorialModal(true);

  // Define the handler function for difficulty changes from GameHeader
  const handleDifficultyChangeFromHeader = (newDifficulty: DifficultyLevel) => {
    // Create the new settings object by merging the new difficulty
    // with the existing settings.
    const newSettings: AppSettings = {
      ...settings, // Spread the current settings
      difficultyLevel: newDifficulty, // Update the difficulty level
    };
    // Call the context's update function
    handleSettingsChange(newSettings);
  };

  // Show loading indicator while fetching puzzle data
  if (loading || !puzzle) {
    return (
      <div className="simple-loading-container">
        <div className="spinner"></div>
        {/* Optional: <p>Loading Puzzle...</p> */}
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
  if (isBoardFading) {
    containerClasses.push('board-fading');
  }
  if (isTutorialMode) {
    containerClasses.push('tutorial-mode');
  }

  // Get tutorial step configuration
  const tutorialConfig = isTutorialMode ? getCurrentStepConfig() : { overlayElements: [] };

  // Determine which board to display (tutorial board or regular board)
  const currentBoard = isTutorialMode && tutorialBoard ? tutorialBoard : puzzle.grid;

  // Handle tile click based on mode
  const onTileClick = (row: number, col: number) => {
    if (isTutorialMode) {
      handleTutorialTileClick(row, col);
    } else {
      handleTileClick(row, col);
    }
  };

  // Handle color selection based on mode
  const onColorSelect = (color: TileColor) => {
    if (isTutorialMode) {
      handleTutorialColorSelect(color);
    } else {
      handleColorSelect(color);
    }
  };

  return (
    <div className={containerClasses.join(' ')}>
      {/* Absolutely Positioned Side Buttons */}
      {/* Desktop Signup Button (Top Left) */}
      {isGuest && (
        <div className="side-button-container top-left desktop-only-signup">
          <SignUpButton />
        </div>
      )}

      {/* Desktop Icon Buttons (Top Right) */}
      <div className="side-button-container top-right desktop-only-icons">
        <button className="icon-button" onClick={handleHomeClick} aria-label="Home">
          <FontAwesomeIcon icon={faHome} />
        </button>
        <button className="icon-button" onClick={handleSettingsClickAction} aria-label="Settings">
          <FontAwesomeIcon icon={faGear} />
        </button>
        <button className="icon-button" onClick={handleStatsClickAction} aria-label="Statistics">
          <FontAwesomeIcon icon={faTrophy} />
        </button>
        <button className="icon-button" onClick={handleInfoClickAction} aria-label="Tutorial">
          <FontAwesomeIcon icon={faInfoCircle} />
        </button>
      </div>

      {/* Main Game Content Wrapper */}
      <div className="main-game-content">
        {/* Confetti for win celebration */}
        {confettiActive && (
          <ReactConfetti
            width={windowDimensions.width}
            height={windowDimensions.height}
            recycle={false}
            numberOfPieces={500}
          />
        )}

        {/* Game Header - updated with hamburger menu props */}
        <GameHeader 
          puzzle={isTutorialMode ? {
            ...puzzle,
            targetColor: 'red' as TileColor,
            algoScore: 7,
            userMovesUsed: currentMoveIndex
          } : puzzle}
          settings={settings}
          getColorCSS={getColorCSSWithSettings}
          onHintClick={handleHint}
          showHintButton={!isTutorialMode || useTutorialContext().showHintButton}
          // Add hamburger menu props
          isMenuOpen={isMenuOpen}
          toggleMenu={toggleMenu}
          isGuest={isGuest}
          onHomeClick={() => handleMenuItemClick(handleHomeClick)}
          onSettingsClick={() => handleMenuItemClick(handleSettingsClickAction)}
          onStatsClick={() => handleMenuItemClick(handleStatsClickAction)}
          onInfoClick={() => handleMenuItemClick(handleInfoClickAction)}
          // Pass the difficulty change handler
          onDifficultyChange={handleDifficultyChangeFromHeader}
        />

        {/* Game Grid */}
        <div className="grid-container" style={{ position: 'relative' }}>
          <GameGrid 
            grid={currentBoard}
            lockedCells={isTutorialMode ? tutorialLockedCells : puzzle.lockedCells}
            hintCell={hintCell}
            settings={settings}
            onTileClick={onTileClick}
            getColorCSS={getColorCSSWithSettings}
          />
          
          {/* Tutorial Highlight for connected tiles */}
          {isTutorialMode && (
            <TutorialHighlight />
          )}
        </div>

        {/* Game Footer */}
        <GameFooter
          puzzle={puzzle}
          settings={settings}
          getLockedColorCSS={() => {
            if (isTutorialMode && tutorialBoard) {
              return getLockedColorCSS(tutorialBoard, tutorialLockedCells, settings);
            }
            return getLockedColorCSSWithSettings();
          }}
          getLockedRegionSize={() => isTutorialMode ? tutorialLockedCells.size : getLockedRegionSize()}
          onTryAgain={handleTryAgain}
        />
      </div>

      {/* Modals - keep these at the bottom of the container */}
      {/* Tutorial Modal - For intro */}
      <TutorialModal 
        isOpen={showTutorialModal} 
        onClose={() => setShowTutorialModal(false)} 
        type="intro"
      />

      {/* Tutorial Step Modal - For regular tutorial steps */}
      {isTutorialMode && (
        <TutorialModal
          isOpen={true}
          onClose={() => {}} // No close option for tutorial steps
          type="step"
        />
      )}

      {/* Tutorial Overlay */}
      {isTutorialMode && tutorialConfig.overlayElements.length > 0 && (
        <TutorialOverlay overlayElements={tutorialConfig.overlayElements} />
      )}

      {/* Tutorial Warning Modal */}
      {isTutorialMode && (
        <TutorialWarningModal 
          isOpen={showWarningModal} 
          onClose={closeWarningModal} 
        />
      )}

      {/* Color Picker Modal */}
      {(() => {
        const showTutorialPicker = isTutorialMode && (
          (showTutorialColorPicker && (suggestedTile || selectedTile))
          || currentStep === TutorialStep.COLOR_SELECTION
        );
        const showGamePicker = showColorPicker && selectedTile && !isTutorialMode;
        
        // Determine the current color to mark in the picker
        let currentPickerColor: TileColor | undefined = undefined;
        if (isTutorialMode && tutorialBoard) {
          if (currentStep === TutorialStep.COLOR_SELECTION) {
            // For COLOR_SELECTION step, explicitly use green as the current color
            // Note: we don't check for selectedTile here as we want to show green regardless
            currentPickerColor = TileColor.Green;
          } else if (suggestedTile) {
            currentPickerColor = tutorialBoard[suggestedTile.row][suggestedTile.col];
          }
        } else if (selectedTile && puzzle?.grid) {
          currentPickerColor = puzzle.grid[selectedTile.row][selectedTile.col];
        }
        
        console.log("App: Tutorial color picker conditions:", {
          showTutorialColorPicker,
          suggestedTile,
          selectedTile,
          currentStep: isTutorialMode ? TutorialStep[currentStep] : 'N/A',
          isTutorialMode,
          shouldShow: showTutorialPicker,
          currentPickerColor
        });
        
        return (showGamePicker || showTutorialPicker) && (
          <ColorPickerModal 
            onSelect={(color) => {
              console.log("DEBUG App: Color selected in modal:", color, 
                "isTutorialMode:", isTutorialMode, 
                "currentStep:", isTutorialMode ? TutorialStep[currentStep] : 'N/A',
                "showTutorialPicker:", showTutorialPicker,
                "showGamePicker:", showGamePicker);
              if (isTutorialMode) {
                console.log("DEBUG App: Calling handleTutorialColorSelect");
                handleTutorialColorSelect(color);
              } else {
                console.log("DEBUG App: Calling regular handleColorSelect");
                handleColorSelect(color);
              }
            }}
            onCancel={() => {
              console.log("App: Color picker cancelled, isTutorialMode:", isTutorialMode);
              if (isTutorialMode) {
                closeTutorialColorPicker();
              } else {
                closeColorPicker();
              }
            }}
            getColorCSS={getColorCSSWithSettings}
            currentColor={currentPickerColor}
          />
        );
      })()}

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
        isLoading={isLoadingStats}
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
  // Check URL path for direct navigation (e.g., /stats)
  const getInitialScreen = (): ScreenType => {
    const path = window.location.pathname.toLowerCase();
    if (path === '/stats' || path === '/stats/') {
      return 'usageStats';
    }
    return 'landing';
  };

  const initialScreen = getInitialScreen();
  const [showLandingPage, setShowLandingPage] = useState(initialScreen === 'landing');
  const [currentScreen, setCurrentScreen] = useState<ScreenType>(initialScreen);

  const navigateToScreen = (screen: ScreenType) => {
    setCurrentScreen(screen);
    setShowLandingPage(screen === 'landing');
    // Update URL without page reload
    const newPath = screen === 'usageStats' ? '/stats' : '/';
    window.history.pushState({}, '', newPath);
  };

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const screen = getInitialScreen();
      setCurrentScreen(screen);
      setShowLandingPage(screen === 'landing');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <NavigationContext.Provider value={{
      showLandingPage,
      setShowLandingPage,
      currentScreen,
      navigateToScreen
    }}>
      <AuthProvider>
        <DataCacheProvider>
          <AuthenticatedApp />
        </DataCacheProvider>
      </AuthProvider>
    </NavigationContext.Provider>
  );
};

const AuthenticatedApp: React.FC = () => {
  const { isAuthenticated, isLoading, currentUser } = useAuth();
  const { showLandingPage, currentScreen } = useNavigation();
  const { fetchAndCacheData, isInitialFetchDone } = useDataCache();
  const fetchInitiated = useRef(false);

  useEffect(() => {
    if (!isLoading && !fetchInitiated.current && !isInitialFetchDone) {
        console.log("AuthenticatedApp: Auth ready, initiating data fetch...");
        fetchInitiated.current = true;
        fetchAndCacheData(currentUser);
    }
  }, [isLoading, fetchAndCacheData, currentUser, isInitialFetchDone]);

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="logo-animation">
          <img src="/tbs_logo.png" alt="The Banana Standard" className="loading-logo" />
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    // Handle navigation based on currentScreen
    if (currentScreen === 'usageStats') {
      return <UsageStatsScreen />;
    } else if (showLandingPage) {
      return <LandingScreen />;
    } else {
      return (
        <GameProvider>
          <TutorialProvider>
            <GameContainer />
          </TutorialProvider>
        </GameProvider>
      );
    }
  }

  return <LandingScreen />;
};

export default App;