import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { TileColor, DailyPuzzle, FirestorePuzzleData } from '../types';
import { AppSettings, defaultSettings } from '../types/settings';
import { GameStatistics, defaultStats } from '../types/stats';
import { HintResult } from '../utils/hintUtils';
import { fetchPuzzleFromFirestore } from '../services/firebaseService';
import { dateKeyForToday } from '../utils/dateUtils';
import { findLargestRegion, generatePuzzleFromDB } from '../utils/gameLogic';
import { applyColorChange, checkIfOnOptimalPath, getGameHint } from '../utils/gameUtils';
import useSettings from '../hooks/useSettings';
import useGameStats from '../hooks/useGameStats';
import { getColorCSS, getLockedColorCSS, getLockedSquaresColor } from '../utils/colorUtils';

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
  
  // Functions
  handleTileClick: (row: number, col: number) => void;
  handleColorSelect: (color: TileColor) => void;
  closeColorPicker: () => void;
  handleTryAgain: () => Promise<void>;
  handleHint: () => void;
  handleSettingsChange: (newSettings: AppSettings) => void;
  getColorCSSWithSettings: (color: TileColor) => string;
  getLockedRegionSize: () => number;
  getLockedColorCSSWithSettings: () => string;
  setShowSettings: (show: boolean) => void;
  setShowStats: (show: boolean) => void;
  setShowWinModal: (show: boolean) => void;
  shareGameStats: () => void;
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
  
  // Settings and stats
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const { settings, updateSettings } = useSettings();
  const { gameStats, updateGameStats } = useGameStats(defaultStats);

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
            fetchPuzzleFromFirestore(DATE_TO_USE),
            timeout
          ]) as Promise<FirestorePuzzleData>;
        };
        
        try {
          const firestoreData = await fetchPuzzleWithTimeout();
          setFirestoreData(firestoreData);
          const newPuzzle = generatePuzzleFromDB(firestoreData, DATE_TO_USE);
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
      handlePuzzleSolved();
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
  const handlePuzzleSolved = () => {
    // Update statistics when puzzle is solved
    const timeSpent = gameStartTime ? Math.floor((new Date().getTime() - gameStartTime.getTime()) / 1000) : 0;
    updateGameStats(true, puzzle!.userMovesUsed, timeSpent);
    setShowWinModal(true);
  };

  // Try again (reset the game)
  const handleTryAgain = async () => {
    try {
      // If the player resets and doesn't solve the puzzle, count it as a played game
      if (puzzle && !puzzle.isSolved) {
        const timeSpent = gameStartTime ? Math.floor((new Date().getTime() - gameStartTime.getTime()) / 1000) : 0;
        updateGameStats(false, puzzle.userMovesUsed, timeSpent);
      }
      
      // Clear any active hints
      setHintCell(null);
      
      let puzzleData = firestoreData;
      // If we don't have the data cached, fetch it
      if (!puzzleData) {
        puzzleData = await fetchPuzzleFromFirestore(DATE_TO_USE);
        setFirestoreData(puzzleData);
      }
      
      // Reset the game
      const newPuzzle = generatePuzzleFromDB(puzzleData, DATE_TO_USE);
      setPuzzle(newPuzzle);
      setIsOnOptimalPath(true);
      setGameStartTime(new Date()); // Reset start time
    } catch (error) {
      console.error("Error in try again:", error);
      setError("Couldn't load new puzzle. Please refresh the page.");
    } finally {
      setShowWinModal(false);
    }
  };

  // Handle settings change
  const handleSettingsChange = (newSettings: AppSettings) => {
    updateSettings(newSettings);
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
    const { todayStats, allTimeStats } = gameStats;
    
    let shareText = `🔒 Color Lock Stats 🔒\n\n`;
    shareText += `Today's Game:\n`;
    shareText += `Moves: ${todayStats.movesUsed}\n`;
    shareText += `Best Score: ${todayStats.bestScore !== null ? todayStats.bestScore : '-'}\n`;
    shareText += `Time: ${Math.floor(todayStats.timeSpent / 60)}:${(todayStats.timeSpent % 60).toString().padStart(2, '0')}\n\n`;
    
    shareText += `All-time Stats:\n`;
    shareText += `Games: ${allTimeStats.gamesPlayed}\n`;
    shareText += `Win Rate: ${allTimeStats.winPercentage.toFixed(0)}%\n`;
    shareText += `Avg Moves: ${allTimeStats.averageMovesPerSolve.toFixed(1)}\n`;
    shareText += `Best Ever: ${allTimeStats.bestScoreEver !== null ? allTimeStats.bestScoreEver : '-'}\n`;
    shareText += `Streak: ${allTimeStats.streak}\n\n`;
    
    shareText += `Play at: https://colorlock.game`;
    
    // Use the copyToClipboard function from shareUtils.ts
    navigator.clipboard.writeText(shareText)
      .then(() => {
        // Show toast or notification
        console.log('Stats copied to clipboard!');
      })
      .catch((err) => {
        console.error('Failed to copy stats: ', err);
      });
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
    
    handleTileClick,
    handleColorSelect,
    closeColorPicker,
    handleTryAgain,
    handleHint,
    handleSettingsChange,
    getColorCSSWithSettings,
    getLockedRegionSize,
    getLockedColorCSSWithSettings,
    setShowSettings,
    setShowStats,
    setShowWinModal,
    shareGameStats
  };

  return (
    <GameContext.Provider value={contextValue}>
      {children}
    </GameContext.Provider>
  );
}; 