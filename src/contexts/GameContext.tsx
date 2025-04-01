import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { TileColor, DailyPuzzle, FirestorePuzzleData } from '../types';
import { AppSettings, defaultSettings, DifficultyLevel } from '../types/settings';
import { GameStatistics, defaultStats } from '../types/stats';
import { HintResult } from '../utils/hintUtils';
import { fetchPuzzle } from '../services/firebaseService';
import { dateKeyForToday } from '../utils/dateUtils';
import { findLargestRegion, generatePuzzleFromDB } from '../utils/gameLogic';
import { applyColorChange, checkIfOnOptimalPath, getGameHint } from '../utils/gameUtils';
import useSettings from '../hooks/useSettings';
import useGameStats from '../hooks/useGameStats';
import { getColorCSS, getLockedColorCSS, getLockedSquaresColor } from '../utils/colorUtils';
import { shouldShowAutocomplete, autoCompletePuzzle } from '../utils/autocompleteUtils';
import { useNavigation } from '../App';

// Interface for the context value
interface GameContextValue {
  // State
  puzzle: DailyPuzzle | null;
  settings: AppSettings;
  loading: boolean;
  error: string | null;
  isOnOptimalPath: boolean;
  hintCell: HintResult | null;
  showColorPicker: boolean;
  selectedTile: { row: number; col: number } | null;
  showWinModal: boolean;
  showSettings: boolean;
  showStats: boolean;
  gameStats: GameStatistics;
  firestoreData: FirestorePuzzleData | null;
  showAutocompleteModal: boolean;
  
  // Functions
  handleTileClick: (row: number, col: number) => void;
  handleColorSelect: (color: TileColor) => void;
  closeColorPicker: () => void;
  handleTryAgain: () => Promise<void>;
  resetLostState: () => void;
  handleHint: () => void;
  handleSettingsChange: (newSettings: AppSettings) => void;
  getColorCSSWithSettings: (color: TileColor) => string;
  getLockedRegionSize: () => number;
  getLockedColorCSSWithSettings: () => string;
  setShowSettings: (show: boolean) => void;
  setShowStats: (show: boolean) => void;
  setShowWinModal: (show: boolean) => void;
  shareGameStats: () => void;
  handleAutoComplete: () => void;
  setShowAutocompleteModal: (show: boolean) => void;
  navigateToHome: () => void;
}

// Create the context with a default undefined value
export const GameContext = createContext<GameContextValue | undefined>(undefined);

// Custom hook to use the game context
export const useGameContext = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
};

// Props for the provider component
interface GameProviderProps {
  children: ReactNode;
}

// Game provider component
export const GameProvider: React.FC<GameProviderProps> = ({ children }) => {
  const GRID_SIZE = 5;
  const DATE_TO_USE = dateKeyForToday();
  const { setShowLandingPage } = useNavigation();

  // Game state
  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedTile, setSelectedTile] = useState<{ row: number; col: number } | null>(null);
  const [showWinModal, setShowWinModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hintCell, setHintCell] = useState<HintResult | null>(null);
  const [firestoreData, setFirestoreData] = useState<FirestorePuzzleData | null>(null);
  const [isOnOptimalPath, setIsOnOptimalPath] = useState(true);
  const [gameStartTime, setGameStartTime] = useState<Date | null>(null);
  const [showAutocompleteModal, setShowAutocompleteModal] = useState(false);
  const [hasDeclinedAutocomplete, setHasDeclinedAutocomplete] = useState(false);
  
  // Settings and stats
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const { settings, updateSettings } = useSettings();
  const { gameStats, updateGameStats, incrementTimesPlayed, generateShareableStats, updateTotalMoves } = useGameStats(defaultStats);

  // Function to navigate to the landing screen
  const navigateToHome = () => {
    // Close any open modals
    setShowColorPicker(false);
    setShowWinModal(false);
    setShowSettings(false);
    setShowStats(false);
    setShowAutocompleteModal(false);
    
    // Navigate to the landing screen using navigation context
    setShowLandingPage(true);
  };

  // Generate the puzzle for the fixed date on first render
  useEffect(() => {
    const loadPuzzle = async () => {
      try {
        setLoading(true);
        
        // Add a timeout to prevent infinite waiting
        const fetchPuzzleWithTimeout = async (): Promise<FirestorePuzzleData> => {
          const timeout = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Fetch timeout')), 10000)
          );
          
          return Promise.race([
            fetchPuzzle(DATE_TO_USE),
            timeout
          ]) as Promise<FirestorePuzzleData>;
        };
        
        try {
          const firestoreData = await fetchPuzzleWithTimeout();
          setFirestoreData(firestoreData);
          const newPuzzle = generatePuzzleFromDB(firestoreData, DATE_TO_USE, settings);
          setPuzzle(newPuzzle);
          setError(null);
        } catch (err) {
          console.error('Detailed fetch error:', err);
          setError('Using offline mode - connected features unavailable');
          throw err; // Re-throw to trigger the fallback
        }
      } catch (finalError) {
        console.error('Critical error in puzzle loading:', finalError);
        setError('Failed to load puzzle. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    };

    loadPuzzle();
  }, []);

  // When the puzzle is first loaded, set the game start time
  useEffect(() => {
    if (puzzle && !gameStartTime) {
      setGameStartTime(new Date());
    }
  }, [puzzle, gameStartTime]);

  // Initialize the locked cells based on the largest region when the puzzle first loads
  useEffect(() => {
    if (puzzle && puzzle.lockedCells.size === 0) {
      // Find the largest region
      const largestRegion = findLargestRegion(puzzle.grid);
      if (largestRegion.size > 0) {
        // Update the puzzle with the locked cells
        setPuzzle(prevPuzzle => {
          if (!prevPuzzle) return null;
          return {
            ...prevPuzzle,
            lockedCells: largestRegion
          };
        });
      }
    }
  }, [puzzle]);

  // Check if puzzle should show autocomplete after puzzle is updated
  useEffect(() => {
    if (puzzle && shouldShowAutocomplete(puzzle) && !hasDeclinedAutocomplete) {
      setShowAutocompleteModal(true);
    }
  }, [puzzle, hasDeclinedAutocomplete]);

  // Handle tile clicks
  const handleTileClick = (row: number, col: number) => {
    if (!puzzle || puzzle.isSolved || puzzle.isLost) return;
    if (puzzle.lockedCells.has(`${row},${col}`)) return;
    setSelectedTile({ row, col });
    setShowColorPicker(true);
  };

  // Handle color selection
  const handleColorSelect = (newColor: TileColor) => {
    if (!selectedTile || !puzzle) return;
    
    // Clear any active hints
    setHintCell(null);
    
    const { row, col } = selectedTile;
    const oldColor = puzzle.grid[row][col];
    if (oldColor === newColor) {
      closeColorPicker();
      return;
    }

    // If this is the first move on a board, increment timesPlayed and potentially daysPlayed
    if (puzzle.userMovesUsed === 0) {
      // This will handle incrementing both timesPlayed and daysPlayed if this is the first game of the day
      incrementTimesPlayed();
    }
    
    // Each color change counts as 1 move in total moves
    updateTotalMoves(1);

    // Apply the color change
    const updatedPuzzle = applyColorChange(puzzle, row, col, newColor);
    setPuzzle(updatedPuzzle);
    
    // Check if the user is still on the optimal path
    const willBeOnPath = checkIfOnOptimalPath(
      updatedPuzzle.grid, 
      updatedPuzzle.userMovesUsed, 
      firestoreData
    );
    setIsOnOptimalPath(willBeOnPath);
    
    closeColorPicker();

    if (updatedPuzzle.isSolved) {
      // Since updatedPuzzle already has the incremented userMovesUsed value,
      // we pass it directly to handlePuzzleSolved
      handlePuzzleSolved(updatedPuzzle);
    }
    
    // Check for autocomplete conditions after every move
    if (shouldShowAutocomplete(updatedPuzzle) && !hasDeclinedAutocomplete) {
      setShowAutocompleteModal(true);
    }
  };

  // Close the color picker
  const closeColorPicker = () => {
    setShowColorPicker(false);
    setSelectedTile(null);
  };

  // Get a hint
  const handleHint = () => {
    // Clear previous hint
    setHintCell(null);
    
    if (!puzzle || !firestoreData) {
      console.error("Cannot provide hint: puzzle or firestoreData is missing");
      return;
    }

    if (puzzle.isSolved || puzzle.isLost) {
      console.log("Game is already over, no hint needed");
      return;
    }

    const hint = getGameHint(puzzle, firestoreData, isOnOptimalPath);
    
    if (hint) {
      setHintCell(hint);
    }
  };

  // Handle puzzle solved
  const handlePuzzleSolved = (solvedPuzzle = puzzle) => {
    // Update statistics when puzzle is solved
    if (solvedPuzzle) {
      // Use the moves from the solvedPuzzle which includes the final move
      // Also pass the bot's score (algoScore) for goal achievement tracking
      // And pass the puzzle date string to track achievements by specific puzzle
      updateGameStats(
        true, 
        solvedPuzzle.userMovesUsed, 
        solvedPuzzle.algoScore,
        solvedPuzzle.dateString
      );
      setShowWinModal(true);
    }
  };

  // Try again (reset the game)
  const handleTryAgain = async () => {
    try {
      // No longer increment times played here - it will be incremented on first move instead
      
      setLoading(true);
      
      // Reset the puzzle state
      if (firestoreData) {
        const newPuzzle = generatePuzzleFromDB(firestoreData, DATE_TO_USE, settings);
        setPuzzle(newPuzzle);
        
        // Reset the game start time
        setGameStartTime(new Date());
        
        // Reset the hint and autocomplete state
        setHintCell(null);
        setShowAutocompleteModal(false);
        setHasDeclinedAutocomplete(false);
        
        // Close any open modals
        setShowWinModal(false);
        
        // Reset the optimal path flag
        setIsOnOptimalPath(true);
      } else {
        setError("Cannot reset the game in offline mode");
      }
    } catch (error) {
      console.error("Failed to reset the game", error);
      setError("Failed to reset the game");
    } finally {
      setLoading(false);
    }
  };

  // Reset lost state without resetting the entire game
  const resetLostState = () => {
    if (puzzle) {
      setPuzzle({
        ...puzzle,
        isLost: false
      });
    }
  };

  // Handle settings change
  const handleSettingsChange = (newSettings: AppSettings) => {
    // Check if difficulty level has changed
    const difficultyChanged = newSettings.difficultyLevel !== settings.difficultyLevel;
    
    // Update settings
    updateSettings(newSettings);
    
    // If difficulty changed and we have firestore data, recreate the puzzle with the new difficulty
    if (difficultyChanged && firestoreData && puzzle) {
      // Calculate new algoScore based on the updated difficulty
      const newAlgoScore = adjustAlgoScoreForDifficulty(firestoreData.algoScore, newSettings.difficultyLevel);
      
      // If the puzzle is already solved, check if the user has achieved the goal with the new difficulty
      if (puzzle.isSolved) {
        console.log('Difficulty changed - checking goal achievement with new difficulty', {
          userMovesUsed: puzzle.userMovesUsed,
          newAlgoScore,
          dateString: puzzle.dateString
        });
        
        // Check if the user has achieved the goal with the new difficulty setting
        // Pass the puzzle date string to track achievements per puzzle
        updateGameStats(
          true, 
          puzzle.userMovesUsed, 
          newAlgoScore,
          puzzle.dateString
        );
      }
      
      // Preserve current state but update algoScore
      const updatedPuzzle = {
        ...puzzle,
        algoScore: newAlgoScore
      };
      
      setPuzzle(updatedPuzzle);
    }
  };

  // Helper function to adjust algoScore based on difficulty
  const adjustAlgoScoreForDifficulty = (baseScore: number, difficultyLevel: DifficultyLevel): number => {
    switch (difficultyLevel) {
      case DifficultyLevel.Easy:
        return baseScore + 3;
      case DifficultyLevel.Medium:
        return baseScore + 1;
      case DifficultyLevel.Hard:
        return baseScore;
      default:
        return baseScore;
    }
  };

  // Get the size of the locked region
  const getLockedRegionSize = () => {
    return puzzle?.lockedCells?.size || 0;
  };

  // Get the CSS color for a tile
  const getColorCSSWithSettings = (color: TileColor) => {
    return getColorCSS(color, settings);
  };

  // Get the CSS color for locked tiles
  const getLockedColorCSSWithSettings = () => {
    if (!puzzle) return '#ffffff';
    return getLockedColorCSS(puzzle.grid, puzzle.lockedCells, settings);
  };

  // Share game statistics
  const shareGameStats = () => {
    const shareText = generateShareableStats();
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText)
        .then(() => {
          console.log('Stats copied to clipboard');
          alert('Game stats copied to clipboard!');
        })
        .catch(err => {
          console.error('Failed to copy stats: ', err);
          alert('Failed to copy stats to clipboard');
        });
    } else {
      console.error('Clipboard API not available');
      alert('Clipboard feature not available on your device');
    }
  };

  // Handle autocomplete
  const handleAutoComplete = () => {
    if (!puzzle) return;
    
    // If this is the first interaction with the puzzle, increment timesPlayed
    if (puzzle.userMovesUsed === 0) {
      incrementTimesPlayed();
    }
    
    // Count this as a move in total moves
    updateTotalMoves(1);
    
    // Apply autocomplete to update all non-locked tiles to target color
    const completedPuzzle = autoCompletePuzzle(puzzle);
    setPuzzle(completedPuzzle);
    
    // Close autocomplete modal
    setShowAutocompleteModal(false);
    
    // Show win modal
    handlePuzzleSolved(completedPuzzle);
  };

  // Modified setShowAutocompleteModal function to handle declining
  const handleSetShowAutocompleteModal = (show: boolean) => {
    setShowAutocompleteModal(show);
    
    // If the user is closing the modal without completing,
    // mark as declined so it doesn't appear again until restart
    if (!show) {
      setHasDeclinedAutocomplete(true);
    }
  };

  // Context value
  const contextValue: GameContextValue = {
    puzzle,
    settings,
    loading,
    error,
    isOnOptimalPath,
    hintCell,
    showColorPicker,
    selectedTile,
    showWinModal,
    showSettings,
    showStats,
    gameStats,
    firestoreData,
    showAutocompleteModal,
    
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
    setShowSettings,
    setShowStats,
    setShowWinModal,
    shareGameStats,
    handleAutoComplete,
    setShowAutocompleteModal: handleSetShowAutocompleteModal,
    navigateToHome
  };

  return (
    <GameContext.Provider value={contextValue}>
      {children}
    </GameContext.Provider>
  );
}; 