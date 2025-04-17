import React, { createContext, useState, useEffect, useContext, ReactNode, useRef, useCallback } from 'react';
import { TileColor, DailyPuzzle, FirestorePuzzleData } from '../types';
import { AppSettings, defaultSettings, DifficultyLevel } from '../types/settings';
import { GameStatistics, defaultStats } from '../types/stats';
import { HintResult } from '../utils/hintUtils';
import {
    auth, // Keep auth import if needed elsewhere
    fetchPuzzleCallable,
    updateUserStatsCallable,
    getUserStatsCallable
} from '../services/firebaseService';
import { httpsCallable } from 'firebase/functions'; // Just import httpsCallable
import { dateKeyForToday } from '../utils/dateUtils';
import { findLargestRegion, generatePuzzleFromDB } from '../utils/gameLogic';
import { applyColorChange, checkIfOnOptimalPath, getGameHint } from '../utils/gameUtils';
import useSettings from '../hooks/useSettings';
import useGameStats from '../hooks/useGameStats';
import { getColorCSS, getLockedColorCSS, getLockedSquaresColor } from '../utils/colorUtils';
import { shouldShowAutocomplete, autoCompletePuzzle } from '../utils/autocompleteUtils';
import { useNavigation } from '../App';
import { useAuth } from './AuthContext';
import { 
  PENDING_MOVES_PUZZLE_ID_KEY, 
  PENDING_MOVES_COUNT_KEY, 
  PENDING_MOVES_TIMESTAMP_KEY 
} from '../utils/storageUtils';

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
  isLoadingStats: boolean;
  movesThisAttempt: number;
  
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
  const { currentUser } = useAuth();

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
  const [isLostReported, setIsLostReported] = useState(false);

  // Local state for tracking attempt details
  const [attemptNumberToday, setAttemptNumberToday] = useState<number>(1);
  const [isFirstTryOfDay, setIsFirstTryOfDay] = useState<boolean>(true);
  const [hintsUsedThisGame, setHintsUsedThisGame] = useState<number>(0);
  const [hasMadeFirstMove, setHasMadeFirstMove] = useState<boolean>(false);
  const [movesThisAttempt, setMovesThisAttempt] = useState<number>(0);
  
  // Settings and stats
  const [showSettings, setShowSettings] = useState(false);
  const [showStatsState, setShowStatsState] = useState(false);
  const { settings, updateSettings } = useSettings();
  const { 
    gameStats, 
    isLoadingStats, 
    setIsLoadingStats, 
    loadInitialStats, 
    generateShareableStats, 
    setFreshStats 
  } = useGameStats(defaultStats);

  // --- Utility Function (Use updateUserStatsCallable) ---
  const callUpdateStats = useCallback(async (data: any) => {
      console.log(`[Stats ${new Date().toISOString()}] callUpdateStats invoked with event: ${data.eventType}, puzzleId: ${data.puzzleId}`);

      // No need to check currentUser here, callable function requires auth implicitly
      // unless the function backend allows unauthenticated access explicitly.
      // Our backend function now requires auth for this.

      console.log(`[Stats ${new Date().toISOString()}] Preparing callable request`);
      console.log(`[Stats ${new Date().toISOString()}] Full payload:`, JSON.stringify(data));

      try {
          console.log(`[Stats ${new Date().toISOString()}] Sending request via httpsCallable...`);
          const startTime = performance.now();

          // Call the callable function
          const result = await updateUserStatsCallable(data);

          const duration = (performance.now() - startTime).toFixed(2);
          console.log(`[Stats ${new Date().toISOString()}] Callable request completed in ${duration}ms`);

          console.log(`[Stats ${new Date().toISOString()}] Result:`, result.data);

          // Check for success AND updatedStats
          if (result.data?.success && result.data.updatedStats) {
             console.log(`[Stats ${new Date().toISOString()}] Backend update successful. Updating local state.`);
             // Update local gameStats state using setFreshStats with the allTimeStats from backend
             setFreshStats(result.data.updatedStats);
             return result.data; // Return full result if needed elsewhere
          } else if (result.data?.success) {
             console.warn(`[Stats ${new Date().toISOString()}] Backend reported success but did not return updatedStats.`);
             return result.data;
          } else {
             // Handle cases where backend explicitly returned success: false or an error structure
             const errorMsg = result.data?.error || 'Unknown backend error';
             console.error(`[Stats ${new Date().toISOString()}] Backend function reported failure: ${errorMsg}`);
             setError(`Failed to update stats: ${errorMsg}`);
             return null;
          }
      } catch (error: any) {
          console.error(`[Stats ${new Date().toISOString()}] Error calling updateUserStats callable:`, error);
          // Handle specific Firebase Functions errors
          let message = error.message || 'Unknown error calling function';
          if (error.code) {
              message = `(${error.code}) ${message}`;
          }
          console.error(`[Stats ${new Date().toISOString()}] Error details:`, error.code, error.details);
          setError(`Failed to update stats: ${message}`);
          return null;
      }
  }, [setFreshStats]); // Removed currentUser dependency

  // --- Utility Function (Use getUserStatsCallable) ---
  const fetchAndSetUserStats = useCallback(async () => {
      // No need to check currentUser here, callable function requires auth implicitly.
      console.log("Fetching user stats via callable function...");
      setIsLoadingStats(true);
      try {
          const result = await getUserStatsCallable(); // No data needed for this call
          console.log("getUserStats callable result:", result.data);

          if (result.data && result.data.success && result.data.stats) {
              // const currentTodayStats = gameStats.todayStats; // Keep this if you want to preserve client-side today's stats
              setFreshStats(result.data.stats);
              setError(null);
          } else {
              throw new Error(result.data?.error || 'Failed to fetch stats');
          }
      } catch (error: any) {
          console.error("Error fetching user stats via callable:", error);
          let message = error.message || 'Unknown error fetching stats';
          if (error.code) {
              message = `(${error.code}) ${message}`;
          }
          setError(`Failed to fetch stats: ${message}`);
      } finally {
          setIsLoadingStats(false);
      }
  }, [setIsLoadingStats, setFreshStats]); // Removed currentUser dependency
  
  // --- Helper function to clear pending moves ---
  const clearPendingMoves = useCallback(() => {
    console.log('Clearing pending moves from localStorage');
    localStorage.removeItem(PENDING_MOVES_PUZZLE_ID_KEY);
    localStorage.removeItem(PENDING_MOVES_COUNT_KEY);
    localStorage.removeItem(PENDING_MOVES_TIMESTAMP_KEY);
  }, []);
  
  // --- Effect to clear pending moves if puzzle date changes ---
  useEffect(() => {
    const storedPuzzleId = localStorage.getItem(PENDING_MOVES_PUZZLE_ID_KEY);
    if (puzzle && storedPuzzleId && storedPuzzleId !== puzzle.dateString) {
      console.log(`Puzzle date changed (${puzzle.dateString} vs stored ${storedPuzzleId}). Clearing old pending moves.`);
      clearPendingMoves();
    }
  }, [puzzle, clearPendingMoves]);

  // --- Effects ---

  // Load puzzle on mount (Use fetchPuzzleCallable)
  useEffect(() => {
    const loadPuzzle = async () => {
      try {
        setLoading(true);
        setError(null); // Clear previous errors
        console.log(`Attempting to fetch puzzle for date: ${DATE_TO_USE} via callable function`);

        // Call the callable function
        const result = await fetchPuzzleCallable({ date: DATE_TO_USE });

        if (result.data.success && result.data.data) {
          console.log('Successfully fetched puzzle data via callable');
          const fetchedFirestoreData = result.data.data;
          setFirestoreData(fetchedFirestoreData);
          const newPuzzle = generatePuzzleFromDB(fetchedFirestoreData, DATE_TO_USE, settings);
          setPuzzle(newPuzzle);

          // Reset attempt state for the new puzzle/day
          setAttemptNumberToday(1);
          setIsFirstTryOfDay(true);
          setHintsUsedThisGame(0);
          setMovesThisAttempt(0);
          setHasMadeFirstMove(false);
          setIsLostReported(false);

        } else {
           // Handle specific errors returned by the function
           throw new Error(result.data.error || 'Failed to fetch puzzle data');
        }

      } catch (err: any) {
        console.error('Error fetching puzzle via callable:', err);
        let errMsg = err.message || String(err);
        // Map Firebase error codes to user-friendly messages
        if (err.code === 'auth/unauthenticated') {
             errMsg = 'Authentication failed. Please log in or play as guest.';
        } else if (err.code === 'auth/not-found') {
             errMsg = `Today's puzzle (${DATE_TO_USE}) is not available yet. Please check back later.`;
        } else if (err.code === 'failed-precondition') {
             errMsg = 'App verification failed. Please ensure your app is registered and up-to-date.';
        } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
             console.error('Puzzle fetch failed in local development. Ensure emulators are running and seeded (`npm run cursor-dev`).');
             errMsg = 'Local dev: Failed to load puzzle. Check emulators and console.';
        } else {
             errMsg = 'Unable to load puzzle. Please check your connection and try again.';
        }
        setError(errMsg);
      } finally {
        setLoading(false);
      }
    };

    // Load initial stats for display
    loadInitialStats(); // Load stats from storage

    loadPuzzle();
  }, [DATE_TO_USE, settings.difficultyLevel, loadInitialStats]); // Rerun if difficulty changes

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

  // Check for autocomplete conditions
  useEffect(() => {
    if (puzzle && !puzzle.isSolved && !puzzle.isLost && shouldShowAutocomplete(puzzle) && !hasDeclinedAutocomplete) {
      setShowAutocompleteModal(true);
    }
  }, [puzzle, hasDeclinedAutocomplete]);

  // Report loss event
  useEffect(() => {
      if (puzzle?.isLost && !isLostReported) {
          // Clear pending moves *before* sending the final loss event
          clearPendingMoves();
          
          console.log(`[STATS-EVENT ${new Date().toISOString()}] Game lost detected - puzzle ID: ${puzzle.dateString}, moves: ${movesThisAttempt}, hints: ${hintsUsedThisGame}`);
          callUpdateStats({
              eventType: 'loss',
              puzzleId: puzzle.dateString,
              movesUsedInGame: movesThisAttempt,
              hintsUsedInGame: hintsUsedThisGame,
              algoScore: puzzle.algoScore
          });
          setIsLostReported(true);
      }
  }, [puzzle?.isLost, puzzle?.dateString, puzzle?.algoScore, hintsUsedThisGame, isLostReported, callUpdateStats, movesThisAttempt, clearPendingMoves]);

  // Fetch fresh stats when the StatsModal is opened
  useEffect(() => {
    if (showStatsState) {
      fetchAndSetUserStats();
    }
  }, [showStatsState, fetchAndSetUserStats]);

  // --- Event Handlers ---

  const handleTileClick = (row: number, col: number) => {
    if (!puzzle || puzzle.isSolved || puzzle.isLost) return;
    if (puzzle.lockedCells.has(`${row},${col}`)) return;
    setSelectedTile({ row, col });
    setShowColorPicker(true);
  };

  const handleColorSelect = (newColor: TileColor) => {
    if (!selectedTile || !puzzle) return;

    setHintCell(null);

    const { row, col } = selectedTile;
    const oldColor = puzzle.grid[row][col];
    if (oldColor === newColor) {
      closeColorPicker();
      return;
    }

    // --- Reconciliation Logic (Before First Move Event) ---
    if (!hasMadeFirstMove) {
      const pendingPuzzleId = localStorage.getItem(PENDING_MOVES_PUZZLE_ID_KEY);
      const pendingMovesStr = localStorage.getItem(PENDING_MOVES_COUNT_KEY);
      const pendingMoves = pendingMovesStr ? parseInt(pendingMovesStr, 10) : 0;

      // Check if there are pending moves for the *current* puzzle date
      if (pendingPuzzleId === puzzle.dateString && pendingMoves > 0) {
        console.log(`[STATS-EVENT ${new Date().toISOString()}] Reconciling ${pendingMoves} abandoned moves for puzzle ${puzzle.dateString}`);
        callUpdateStats({
          eventType: 'reconcileAbandonedMoves',
          puzzleId: puzzle.dateString,
          movesToAdd: pendingMoves,
        });
        // Clear *after* sending reconcile event
        clearPendingMoves();
      }

      // Send firstMove event (increments totalGamesPlayed and attemptsPerDay)
      console.log(`[STATS-EVENT ${new Date().toISOString()}] First move of game detected at position [${row},${col}] - puzzle ID: ${puzzle.dateString}`);
      callUpdateStats({
        eventType: 'firstMove',
        puzzleId: puzzle.dateString,
      });
      setHasMadeFirstMove(true);
    }

    // Increment local move counter *after* potential reconciliation/firstMove events
    const newMovesThisAttempt = movesThisAttempt + 1;
    setMovesThisAttempt(newMovesThisAttempt);

    // --- Persist In-Progress Moves ---
    try {
      localStorage.setItem(PENDING_MOVES_PUZZLE_ID_KEY, puzzle.dateString);
      localStorage.setItem(PENDING_MOVES_COUNT_KEY, newMovesThisAttempt.toString());
      localStorage.setItem(PENDING_MOVES_TIMESTAMP_KEY, Date.now().toString());
    } catch (e) {
      console.error("Failed to save pending moves to localStorage", e);
    }
    // --- End Persistence ---

    const updatedPuzzle = applyColorChange(puzzle, row, col, newColor);
    setPuzzle(updatedPuzzle);

    const onPath = checkIfOnOptimalPath(updatedPuzzle.grid, updatedPuzzle.userMovesUsed, firestoreData);
    setIsOnOptimalPath(onPath);

    closeColorPicker();

    if (updatedPuzzle.isSolved) {
      handlePuzzleSolved(updatedPuzzle); // Will clear pending moves inside
    }

    if (updatedPuzzle.isLost && !isLostReported) {
      // Loss event is handled by useEffect, need to clear there too
    }

    if (!updatedPuzzle.isSolved && !updatedPuzzle.isLost && shouldShowAutocomplete(updatedPuzzle) && !hasDeclinedAutocomplete) {
      setShowAutocompleteModal(true);
    }
  };

  const closeColorPicker = () => {
    setShowColorPicker(false);
    setSelectedTile(null);
  };

  const handleHint = () => {
    if (!puzzle || !firestoreData || puzzle.isSolved || puzzle.isLost) return;

    const hint = getGameHint(puzzle, firestoreData, isOnOptimalPath);
    if (hint) {
      setHintCell(hint);
      setHintsUsedThisGame(prev => prev + 1);
      console.log(`[STATS-EVENT ${new Date().toISOString()}] Hint used at position [${hint.row},${hint.col}] - puzzle ID: ${puzzle.dateString}. Local movesThisAttempt NOT incremented.`);
      callUpdateStats({
        eventType: 'hint',
        puzzleId: puzzle.dateString,
        hintsUsedInGame: 1,
      });
    } else {
      console.log("No valid hint could be generated.");
    }
  };

  const handlePuzzleSolved = (solvedPuzzle: DailyPuzzle) => {
    // Clear pending moves *before* sending the final win event
    clearPendingMoves();

    console.log(`[STATS-EVENT ${new Date().toISOString()}] Game won - puzzle ID: ${solvedPuzzle.dateString}, userScore: ${solvedPuzzle.userMovesUsed}, algoScore: ${solvedPuzzle.algoScore}, total moves this attempt: ${movesThisAttempt}, hints: ${hintsUsedThisGame}, first try: ${isFirstTryOfDay}, attempt #: ${attemptNumberToday}`);
    callUpdateStats({
      eventType: 'win',
      puzzleId: solvedPuzzle.dateString,
      userScore: solvedPuzzle.userMovesUsed,
      algoScore: solvedPuzzle.algoScore,
      movesUsedInGame: movesThisAttempt, // Send final count for this attempt
      hintsUsedInGame: hintsUsedThisGame,
      isFirstTryOfDay: isFirstTryOfDay,
      attemptNumberToday: attemptNumberToday,
    });
    setShowWinModal(true);
  };

  const handleTryAgain = async () => {
    if (!puzzle || !firestoreData) {
      setError("Cannot reset game state.");
      return;
    }

    // Determine if moves were already counted by win/loss
    const movesAlreadyCounted = puzzle.isSolved || puzzle.isLost;
    const movesToSend = movesAlreadyCounted ? 0 : movesThisAttempt; // Send 0 if already won/lost

    // Clear pending moves *before* sending the tryAgain event,
    // but only if moves weren't already counted (i.e., abandoning mid-game)
    if (!movesAlreadyCounted && movesToSend > 0) {
      clearPendingMoves();
    }

    console.log(`[STATS-EVENT ${new Date().toISOString()}] User clicked Try Again - puzzle ID: ${puzzle.dateString}, moves: ${movesThisAttempt}, hints: ${hintsUsedThisGame}, isSolved: ${puzzle.isSolved}, isLost: ${puzzle.isLost}, sending ${movesToSend} moves.`);

    // Conditionally send movesUsedInGame
    callUpdateStats({
        eventType: 'tryAgain',
        puzzleId: puzzle.dateString,
        movesUsedInGame: movesToSend, // Use the conditional value
        hintsUsedInGame: hintsUsedThisGame, // Keep sending hints used in attempt
        algoScore: puzzle.algoScore // Keep sending algoScore if needed by backend logic
    });

    try {
      setLoading(true);
      const newPuzzle = generatePuzzleFromDB(firestoreData, DATE_TO_USE, settings);
      setPuzzle(newPuzzle);

      // Reset attempt-specific state
      setAttemptNumberToday(prev => prev + 1); // Still track attempt number locally if needed
      setIsFirstTryOfDay(false);
      setHintsUsedThisGame(0);
      setMovesThisAttempt(0);
      setHasMadeFirstMove(false);
      setIsLostReported(false);

      // Reset UI state
      setHintCell(null);
      setShowAutocompleteModal(false);
      setHasDeclinedAutocomplete(false);
      setShowWinModal(false);
      setIsOnOptimalPath(true);
      setError(null);
    } catch (error) {
      console.error("Failed to reset the game", error);
      setError("Failed to reset the game");
    } finally {
      setLoading(false);
    }
  };

  const resetLostState = () => {
      if (puzzle) {
          console.log(`[STATS-EVENT ${new Date().toISOString()}] Closing lost game modal - puzzle ID: ${puzzle.dateString}, isSolved: ${puzzle.isSolved}, isLost: ${puzzle.isLost}`);
          // This function is called by the LostGameModal's onClose prop
          // It doesn't directly trigger any stats updates, which is correct
          // The modal's "Try Again" button calls handleTryAgain separately
      }
  };

  const handleSettingsChange = (newSettings: AppSettings) => {
    const difficultyChanged = newSettings.difficultyLevel !== settings.difficultyLevel;
    updateSettings(newSettings);

    if (difficultyChanged && firestoreData) {
      const newPuzzle = generatePuzzleFromDB(firestoreData, DATE_TO_USE, newSettings);
      setPuzzle(newPuzzle);
      setAttemptNumberToday(1);
      setIsFirstTryOfDay(true);
      setHintsUsedThisGame(0);
      setMovesThisAttempt(0);
      setHasMadeFirstMove(false);
      setIsLostReported(false);
      setIsOnOptimalPath(true);
    }
  };

  const handleAutoComplete = () => {
      if (!puzzle) return;

      // 1. Get moves made *before* autocomplete
      // Use the current state value as it represents moves up to this point
      const movesBeforeAutocomplete = movesThisAttempt;

      // 2. Calculate additional moves needed by simulating autocomplete
      // We need a temporary puzzle object to avoid modifying the main state yet
      const tempPuzzleForCalc = { ...puzzle };
      const completedPuzzleState = autoCompletePuzzle(tempPuzzleForCalc); 
      
      // Calculate moves added by comparing final score to moves before autocomplete
      const additionalMoves = completedPuzzleState.userMovesUsed - tempPuzzleForCalc.userMovesUsed;
      const finalMovesForThisAttempt = movesBeforeAutocomplete + additionalMoves;

      // Clear pending moves *before* sending the final win event
      clearPendingMoves();

      // 3. Update local state with the additional moves for UI/state consistency
      setMovesThisAttempt(finalMovesForThisAttempt);

      // 4. Handle first move event if needed
      if (!hasMadeFirstMove) {
          console.log(`[STATS-EVENT ${new Date().toISOString()}] First move via Autocomplete - puzzle ID: ${puzzle.dateString}`);
          callUpdateStats({
              eventType: 'firstMove',
              puzzleId: puzzle.dateString,
          });
          setHasMadeFirstMove(true);
      }

      // 5. Apply the autocomplete to the actual puzzle state for UI update
      const completedPuzzle = autoCompletePuzzle(puzzle);
      setPuzzle(completedPuzzle);
      setShowAutocompleteModal(false);

      // 6. Send the 'win' event with the explicitly calculated total moves for the attempt
      console.log(`[STATS-EVENT ${new Date().toISOString()}] Game won via Autocomplete - puzzle ID: ${completedPuzzle.dateString}, userScore: ${completedPuzzle.userMovesUsed}, algoScore: ${completedPuzzle.algoScore}, moves this attempt: ${finalMovesForThisAttempt}, hints: ${hintsUsedThisGame}`);
      callUpdateStats({
          eventType: 'win',
          puzzleId: completedPuzzle.dateString,
          userScore: completedPuzzle.userMovesUsed,
          algoScore: completedPuzzle.algoScore,
          movesUsedInGame: finalMovesForThisAttempt, // Use explicit calculated value
          hintsUsedInGame: hintsUsedThisGame,
          isFirstTryOfDay: isFirstTryOfDay,
          attemptNumberToday: attemptNumberToday,
      });

      // 7. Show win modal
      setShowWinModal(true);
  };

  const handleSetShowAutocompleteModal = (show: boolean) => {
    setShowAutocompleteModal(show);
    if (!show) {
      setHasDeclinedAutocomplete(true);
    }
  };

  const handleSetShowStats = (show: boolean) => {
      setShowStatsState(show);
      if (show) {
          // Fetch fresh stats when the modal is opened
          fetchAndSetUserStats();
      }
  };

  // Memoize the share function with useCallback
  const shareGameStats = useCallback(() => {
    // Use the text generator from the useGameStats hook
    const shareText = generateShareableStats();
    
    // Handle copying to clipboard
    navigator.clipboard.writeText(shareText)
      .then(() => {
        console.log('Stats copied to clipboard');
        // Could show a toast notification here if desired
      })
      .catch(err => {
        console.error('Failed to copy stats:', err);
      });
  }, [generateShareableStats]); // Add dependency on generateShareableStats

  const navigateToHome = () => {
    setShowColorPicker(false);
    setShowWinModal(false);
    setShowSettings(false);
    setShowStatsState(false);
    setShowAutocompleteModal(false);
    setShowLandingPage(true);
  };

  const getLockedRegionSize = () => puzzle?.lockedCells?.size || 0;
  const getColorCSSWithSettings = (color: TileColor) => getColorCSS(color, settings);
  const getLockedColorCSSWithSettings = () => {
    if (!puzzle) return '#ffffff';
    return getLockedColorCSS(puzzle.grid, puzzle.lockedCells, settings);
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
    showStats: showStatsState,
    gameStats,
    firestoreData,
    showAutocompleteModal,
    isLoadingStats,
    movesThisAttempt,
    
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
    setShowStats: handleSetShowStats,
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