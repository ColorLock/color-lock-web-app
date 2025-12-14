import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback, useRef } from 'react';
import { TileColor, DailyPuzzle, FirestorePuzzleData, PuzzleGrid } from '../types';
import { AppSettings, DifficultyLevel } from '../types/settings';
import { GameStatistics, defaultStats } from '../types/stats';
import { HintResult, decodeActionId, encodeAction } from '../utils/hintUtils';
import { floodFill, convertArrayToFirestoreGrid } from '../utils/gameLogic';
import {
    fetchPuzzleV2Callable,
    getPersonalStatsCallable,
    recordPuzzleHistoryCallable,
    getWinModalStatsCallable,
    setHintUsedForPuzzleCallable
} from '../services/firebaseService';
import { dateKeyForToday } from '../utils/dateUtils';
import { findLargestRegion, generatePuzzleFromDB } from '../utils/gameLogic';
import { applyColorChange, checkIfOnOptimalPath, getGameHint } from '../utils/gameUtils';
import useSettings from '../hooks/useSettings';
import useGameStats from '../hooks/useGameStats';
import { getColorCSS, getLockedColorCSS } from '../utils/colorUtils';
import { shouldShowAutocomplete, autoCompletePuzzle } from '../utils/autocompleteUtils';
import { useNavigation } from '../App';
import { useAuth } from './AuthContext';
import { useDataCache } from './DataCacheContext'; // Import the cache context hook

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
  winModalStats: {
    totalAttempts: number | null;
    currentPuzzleCompletedStreak: number | null;
    currentTieBotStreak: number | null;
    currentFirstTryStreak: number | null;
    difficulty: DifficultyLevel | null;
  } | null;
  
  // Functions
  handleTileClick: (row: number, col: number) => void;
  handleColorSelect: (color: TileColor) => void;
  closeColorPicker: () => void;
  handleTryAgain: () => Promise<void>;
  resetLostState: () => void;
  handleBotSolutionClick: () => void;
  handleBotSolutionConfirm: () => void;
  handleCancelAutoSolution: () => void;
  isAutoSolving: boolean;
  showBotSolutionModal: boolean;
  setShowBotSolutionModal: (show: boolean) => void;
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
  const DATE_TO_USE = dateKeyForToday();
  const { setShowLandingPage } = useNavigation();
  const { currentUser } = useAuth();
  const { 
    puzzleDataV2: cachedPuzzleDataMap, 
    userStats: cachedUserStats, 
    winModalStats: cachedWinModalStats,
    loadingStates: cacheLoadingStates 
  } = useDataCache(); // Use cache hook

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
  const [hasRecordedCompletion, setHasRecordedCompletion] = useState(false);
  const [hasUsedBotSolutionThisAttempt, setHasUsedBotSolutionThisAttempt] = useState(false);

  // Local state for tracking attempt details (per-difficulty)
  const [attemptsByDifficulty, setAttemptsByDifficulty] = useState<{
    easy: number;
    medium: number;
    hard: number;
  }>({ easy: 1, medium: 1, hard: 1 });
  const [isFirstTryOfDay, setIsFirstTryOfDay] = useState<boolean>(true);
  const [hintsUsedThisGame, setHintsUsedThisGame] = useState<number>(0);
  const [movesThisAttempt, setMovesThisAttempt] = useState<number>(0);
  const [userStateHistory, setUserStateHistory] = useState<PuzzleGrid[]>([]);
  const [userActionHistory, setUserActionHistory] = useState<number[]>([]);
  const [isAutoSolving, setIsAutoSolving] = useState<boolean>(false);
  const [autoSolveIntervalId, setAutoSolveIntervalId] = useState<NodeJS.Timeout | null>(null);
  const autoSolveTimeoutIdsRef = useRef<NodeJS.Timeout[]>([]);
  const [showBotSolutionModal, setShowBotSolutionModal] = useState<boolean>(false);
  const [winModalStats, setWinModalStats] = useState<{
    totalAttempts: number | null;
    currentPuzzleCompletedStreak: number | null;
    currentTieBotStreak: number | null;
    currentFirstTryStreak: number | null;
    difficulty: DifficultyLevel | null;
  } | null>(null);
  
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

  // --- Utility Function: Record completed puzzle history ---
  const recordPuzzleHistory = useCallback(async (payload: any) => {
    try {
      const startTime = performance.now();
      const result = await recordPuzzleHistoryCallable(payload);
      const duration = (performance.now() - startTime).toFixed(2);
      console.log(`[History ${new Date().toISOString()}] recordPuzzleHistory completed in ${duration}ms`, result.data);
      if (!result.data?.success) {
        const errMsg = result.data?.error || 'Unknown backend error';
        setError(`Failed to record puzzle history: ${errMsg}`);
      }
    } catch (error: any) {
      console.error(`[History ${new Date().toISOString()}] Error calling recordPuzzleHistory:`, error);
      let message = error.message || 'Unknown error calling function';
      if (error.code) {
        message = `(${error.code}) ${message}`;
      }
      setError(`Failed to record puzzle history: ${message}`);
    }
  }, []);

  // --- Utility Function (Use getPersonalStatsCallable) ---
  const fetchAndSetUserStats = useCallback(async () => {
    // Check cache first
    if (cachedUserStats) {
        console.log("GameContext: Using cached user stats.");
        setFreshStats(cachedUserStats);
        setIsLoadingStats(false);
        setError(null);
        return;
    }

    // If not in cache or user is guest/unauthenticated, fetch (if applicable)
    if (!currentUser) {
        console.log("GameContext: Skipping user stats fetch (no user logged in).");
        setFreshStats({...defaultStats}); // Reset to default if no cache and no user
        setIsLoadingStats(false);
        return;
    }

    console.log("GameContext: No cached user stats, fetching from backend...");
    setIsLoadingStats(true);
    
    try {
        const result = await getPersonalStatsCallable({
            puzzleId: dateKeyForToday(),
            difficulty: settings.difficultyLevel
        });
        if (result.data.success) {
            if (result.data.stats) {
                console.log("GameContext: User stats fetched successfully.");
                setFreshStats(result.data.stats);
            } else {
                console.log("GameContext: No stats found for user, using defaults.");
                setFreshStats({...defaultStats});
            }
        } else {
            throw new Error(result.data.error || 'Failed to fetch user stats');
        }
    } catch (error: any) {
        console.error("GameContext: Error fetching user stats:", error);
        setError(error.message || 'Failed to load user stats');
        setFreshStats({...defaultStats}); // Use defaults on error
    } finally {
        setIsLoadingStats(false);
    }
  }, [cachedUserStats, currentUser, setFreshStats, setIsLoadingStats]);
  
  // Removed pending-move persistence; we only record at completion now

  // --- Effects ---

  // Load puzzle on mount (Use fetchPuzzleV2 callable and cached per-difficulty data)
  useEffect(() => {
    const loadPuzzle = async () => {
      setLoading(true);
      setError(null); // Clear previous errors

      const difficulty = settings.difficultyLevel;

      // 1. Check Cache
      const cachedPuzzleForDifficulty = cachedPuzzleDataMap?.[difficulty];
      if (cachedPuzzleForDifficulty) {
        console.log("GameContext: Using cached puzzle data.");
        try {
            setFirestoreData(cachedPuzzleForDifficulty); // Store raw data
            const newPuzzle = generatePuzzleFromDB(
              cachedPuzzleForDifficulty,
              DATE_TO_USE,
              settings,
              { skipDifficultyAdjustments: true }
            );
            setPuzzle(newPuzzle);
            // Reset attempt state for the new puzzle/day (all difficulties)
            setAttemptsByDifficulty({ easy: 1, medium: 1, hard: 1 });
            setIsFirstTryOfDay(true);
            setHintsUsedThisGame(0);
            setMovesThisAttempt(0);
            setUserStateHistory([]);
            setUserActionHistory([]);
            setIsLostReported(false);
            setHasRecordedCompletion(false);
            setHasUsedBotSolutionThisAttempt(false);
            setLoading(false);
            return; // Exit early, used cache
        } catch (genError) {
             console.error("GameContext: Error generating puzzle from cached data:", genError);
             setError("Failed to process cached puzzle data.");
             // Continue to fetch as fallback
        }
      }

      // 1b. If cache is still loading, wait for it to finish before fetching
      if (cacheLoadingStates.puzzle) {
        return;
      }

      // 2. Fetch if not in cache (or cache processing failed)
      console.log(`GameContext: No cached puzzle data for ${difficulty}, fetching for date: ${DATE_TO_USE} via fetchPuzzleV2Callable`);
      try {
        const result = await fetchPuzzleV2Callable({ date: DATE_TO_USE }); // Use imported callable
        if (result.data.success && result.data.data) {
          console.log('GameContext: Successfully fetched puzzle data via fetchPuzzleV2Callable (fallback)');
          const fetchedFirestoreData = result.data.data[difficulty];
          if (!fetchedFirestoreData) {
            throw new Error(`Puzzle data for difficulty ${difficulty} is missing from fetchPuzzleV2 response`);
          }
          setFirestoreData(fetchedFirestoreData); // Store raw data
          const newPuzzle = generatePuzzleFromDB(
            fetchedFirestoreData,
            DATE_TO_USE,
            settings,
            { skipDifficultyAdjustments: true }
          );
          setPuzzle(newPuzzle);
          // Reset attempt state (all difficulties)
          setAttemptsByDifficulty({ easy: 1, medium: 1, hard: 1 });
          setIsFirstTryOfDay(true);
          setHintsUsedThisGame(0);
          setMovesThisAttempt(0);
          setUserStateHistory([]);
          setUserActionHistory([]);
          setIsLostReported(false);
          setHasRecordedCompletion(false);
          setHasUsedBotSolutionThisAttempt(false);
        } else {
          throw new Error(result.data.error || 'Failed to fetch puzzle data');
        }
      } catch (err: any) {
        console.error('GameContext: Error fetching puzzle via callable (fallback):', err);
        let errMsg = err.message || String(err);
        // Map Firebase error codes to user-friendly messages
        if (err.code === 'auth/unauthenticated') {
             errMsg = 'Authentication failed. Please log in or play as guest.';
        } else if (err.code === 'auth/not-found' || err.code === 'not-found' || err.code === 'functions/not-found') {
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

    loadInitialStats(); // Load stats from storage (cache)
    loadPuzzle(); // Load puzzle (checks cache first)

  }, [DATE_TO_USE, settings, loadInitialStats, cachedPuzzleDataMap, cacheLoadingStates.puzzle]); // Add cachedPuzzleData dependency

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
    if (puzzle && !puzzle.isSolved && !puzzle.isLost && shouldShowAutocomplete(puzzle) && !hasDeclinedAutocomplete && !isAutoSolving) {
      setShowAutocompleteModal(true);
    }
  }, [puzzle, hasDeclinedAutocomplete, isAutoSolving]);

  // Report loss event (record only on completion)
  useEffect(() => {
      if (puzzle?.isLost && !isLostReported) {
          console.log(`[STATS-EVENT ${new Date().toISOString()}] Game lost detected - puzzle ID: ${puzzle.dateString}, moves: ${movesThisAttempt}, hints: ${hintsUsedThisGame}`);
          recordPuzzleHistory({
            puzzle_id: puzzle.dateString,
            difficulty: settings.difficultyLevel,
            attemptNumber: attemptsByDifficulty[settings.difficultyLevel],
            moves: movesThisAttempt,
            hintUsed: hintsUsedThisGame > 0,
            botMoves: puzzle.algoScore,
            win_loss: 'loss',
            states: userStateHistory,
            actions: userActionHistory,
            targetColor: puzzle.targetColor,
            colorMap: firestoreData?.colorMap
          }).finally(() => {
            // Clear history after recording to prevent memory buildup
            setUserStateHistory([]);
            setUserActionHistory([]);
          });
          setIsLostReported(true);
          setHasRecordedCompletion(true);
      }
  }, [puzzle?.isLost, puzzle?.dateString, puzzle?.algoScore, hintsUsedThisGame, isLostReported, movesThisAttempt, recordPuzzleHistory, settings.difficultyLevel, isFirstTryOfDay, attemptsByDifficulty]);

  // Load cached win modal stats on mount
  useEffect(() => {
    if (cachedWinModalStats) {
      console.log("GameContext: Loading cached win modal stats on mount.");
      setWinModalStats(cachedWinModalStats);
    }
  }, [cachedWinModalStats]);

  // Fetch fresh stats when the StatsModal is opened
  useEffect(() => {
    if (showStatsState) {
      fetchAndSetUserStats();
    }
  }, [showStatsState, fetchAndSetUserStats]);

  // Cleanup auto-solve interval and timeouts on unmount or puzzle change
  useEffect(() => {
    return () => {
      if (autoSolveIntervalId) {
        clearInterval(autoSolveIntervalId);
      }
      // Clear all pending timeouts
      autoSolveTimeoutIdsRef.current.forEach((timeoutId: NodeJS.Timeout) => clearTimeout(timeoutId));
    };
  }, [autoSolveIntervalId]);

  // --- Event Handlers ---

  const handleTileClick = (row: number, col: number) => {
    if (isAutoSolving) return; // Block input during auto-solve
    if (!puzzle || puzzle.isSolved || puzzle.isLost) return;
    if (puzzle.lockedCells.has(`${row},${col}`)) return;
    setSelectedTile({ row, col });
    setShowColorPicker(true);
  };

  const handleColorSelect = (newColor: TileColor) => {
    if (isAutoSolving) return; // Block input during auto-solve
    if (!selectedTile || !puzzle) return;

    setHintCell(null);

    const { row, col } = selectedTile;
    const oldColor = puzzle.grid[row][col];
    if (oldColor === newColor) {
      closeColorPicker();
      return;
    }

    // Increment local move counter
    const newMovesThisAttempt = movesThisAttempt + 1;
    setMovesThisAttempt(newMovesThisAttempt);

    // Capture state BEFORE move for history tracking
    if (firestoreData) {
      const puzzleGridState = convertArrayToFirestoreGrid(puzzle.grid);
      setUserStateHistory(prev => {
        const newHistory = [...prev, puzzleGridState];
        console.log(`[HISTORY] Captured state #${newHistory.length}`, puzzleGridState);
        return newHistory;
      });

      const encodedAction = encodeAction(row, col, newColor, firestoreData, puzzle.grid.length);
      setUserActionHistory(prev => {
        const newActions = [...prev, encodedAction];
        console.log(`[HISTORY] Captured action #${newActions.length}:`, encodedAction);
        return newActions;
      });
    }

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

    if (!updatedPuzzle.isSolved && !updatedPuzzle.isLost && shouldShowAutocomplete(updatedPuzzle) && !hasDeclinedAutocomplete && !isAutoSolving) {
      setShowAutocompleteModal(true);
    }
  };

  const closeColorPicker = () => {
    setShowColorPicker(false);
    setSelectedTile(null);
  };

  const handleBotSolutionClick = () => {
    if (!puzzle || puzzle.isSolved || puzzle.isLost) return;
    if (isAutoSolving) return; // Ignore if already auto-solving
    setShowBotSolutionModal(true);
  };

  const handleBotSolutionConfirm = () => {
    setShowBotSolutionModal(false);
    setHintsUsedThisGame(1); // Mark that solution was used
    setHasUsedBotSolutionThisAttempt(true);
    console.log(`[BOT SOLUTION ${new Date().toISOString()}] Bot solution requested - puzzle ID: ${puzzle?.dateString}. Attempt number: ${attemptsByDifficulty[settings.difficultyLevel]}`);

    // Start the solution immediately
    executeAutoSolution();

    // Persist hint/solution usage for this puzzle+difficulty in the background (don't await)
    if (puzzle) {
      setHintUsedForPuzzleCallable({
        puzzleId: puzzle.dateString,
        difficulty: settings.difficultyLevel
      }).catch(err => {
        console.error('Failed to mark hint/solution usage for puzzle', err);
      });
    }
  };

  const executeAutoSolution = () => {
    if (!puzzle) {
      setError("Cannot execute bot solution - puzzle data incomplete");
      return;
    }

    setIsAutoSolving(true);
    autoSolveTimeoutIdsRef.current = []; // Clear any previous timeout IDs

    // Check if we have valid bot solution data
    const hasValidBotSolution = firestoreData &&
                                 firestoreData.actions &&
                                 firestoreData.actions.length > 0;

    if (hasValidBotSolution) {
      // Try to use bot solution from actions array
      let currentActionIndex = puzzle.userMovesUsed + puzzle.effectiveStartingMoveIndex;

      // Track current grid state to calculate connected cells correctly
      let currentGrid = puzzle.grid.map(row => [...row]);

      const interval = setInterval(() => {
        // Check if we've completed all actions
        if (currentActionIndex >= firestoreData.actions.length) {
          clearInterval(interval);
          setIsAutoSolving(false);
          setHintCell(null);
          autoSolveTimeoutIdsRef.current = [];
          return;
        }

        // Get next action and decode it
        const actionId = firestoreData.actions[currentActionIndex];
        const hint = decodeActionId(actionId, firestoreData);

        if (!hint || !hint.valid) {
          clearInterval(interval);
          setIsAutoSolving(false);
          autoSolveTimeoutIdsRef.current = [];
          console.error("Invalid hint during auto-solve, falling back to simple solution");
          // Fall back to simple solution
          executeSimpleFallbackSolution();
          return;
        }

        // Calculate connected cells for this hint using flood fill on CURRENT grid
        const currentColor = currentGrid[hint.row][hint.col];
        const [rowIndices, colIndices] = floodFill(currentGrid, hint.row, hint.col, currentColor);
        const connectedCells: [number, number][] = [];
        for (let i = 0; i < rowIndices.length; i++) {
          connectedCells.push([rowIndices[i], colIndices[i]]);
        }

        // Show hint animation with connected cells (reuse existing highlight)
        setHintCell({ ...hint, connectedCells });

        // After 2 seconds, apply the move automatically
        const timeoutId = setTimeout(() => {
          setPuzzle(prevPuzzle => {
            if (!prevPuzzle) return prevPuzzle;

            try {
              const updatedPuzzle = applyColorChange(prevPuzzle, hint.row, hint.col, hint.newColor);
              // Don't increment movesThisAttempt during bot solution
              setHintCell(null);

              // Update our tracked grid to match
              currentGrid = updatedPuzzle.grid.map(row => [...row]);

              // Check if puzzle is now solved
              if (updatedPuzzle.isSolved) {
                clearInterval(interval);
                setIsAutoSolving(false);
                autoSolveTimeoutIdsRef.current = [];
                // Don't call handlePuzzleSolved - bot solution doesn't count as completing the puzzle
              }

              return updatedPuzzle;
            } catch (error) {
              console.error("Error applying bot solution move, falling back to simple solution:", error);
              clearInterval(interval);
              setIsAutoSolving(false);
              setHintCell(null);
              autoSolveTimeoutIdsRef.current = [];
              // Fall back to simple solution
              const fallbackTimeoutId = setTimeout(() => executeSimpleFallbackSolution(), 100);
              autoSolveTimeoutIdsRef.current = [fallbackTimeoutId];
              return prevPuzzle;
            }
          });
        }, 2000); // 2 seconds to show hint

        // Track this timeout ID
        autoSolveTimeoutIdsRef.current.push(timeoutId);

        currentActionIndex++;
      }, 3000); // 3 seconds between moves

      setAutoSolveIntervalId(interval);
    } else {
      // No valid bot solution data, use fallback
      console.log("No valid bot solution data, using simple fallback solution");
      executeSimpleFallbackSolution();
    }
  };

  // Fallback solution: simply change each non-target-color cell to target color
  const executeSimpleFallbackSolution = () => {
    if (!puzzle) return;

    setIsAutoSolving(true);
    autoSolveTimeoutIdsRef.current = []; // Clear any previous timeout IDs
    const targetColor = puzzle.targetColor;

    const interval = setInterval(() => {
      setPuzzle(prevPuzzle => {
        if (!prevPuzzle) return prevPuzzle;

        // Find first non-locked cell that's not the target color
        for (let row = 0; row < prevPuzzle.grid.length; row++) {
          for (let col = 0; col < prevPuzzle.grid[row].length; col++) {
            const cellKey = `${row},${col}`;
            const isLocked = prevPuzzle.lockedCells.has(cellKey);
            const currentColor = prevPuzzle.grid[row][col];

            if (!isLocked && currentColor !== targetColor) {
              // Found a cell to change - calculate connected cells using flood fill
              const [rowIndices, colIndices] = floodFill(prevPuzzle.grid, row, col, currentColor);
              const connectedCells: [number, number][] = [];
              for (let i = 0; i < rowIndices.length; i++) {
                connectedCells.push([rowIndices[i], colIndices[i]]);
              }

              const hint: HintResult = {
                row,
                col,
                newColor: targetColor,
                valid: true,
                connectedCells
              };

              setHintCell(hint);

              const timeoutId = setTimeout(() => {
                setPuzzle(innerPuzzle => {
                  if (!innerPuzzle) return innerPuzzle;

                  const updatedPuzzle = applyColorChange(innerPuzzle, row, col, targetColor);
                  // Don't increment movesThisAttempt during bot solution
                  setHintCell(null);

                  // Check if puzzle is now solved
                  if (updatedPuzzle.isSolved) {
                    clearInterval(interval);
                    setIsAutoSolving(false);
                    autoSolveTimeoutIdsRef.current = [];
                    // Don't call handlePuzzleSolved - bot solution doesn't count as completing the puzzle
                  }

                  return updatedPuzzle;
                });
              }, 2000);

              // Track this timeout ID
              autoSolveTimeoutIdsRef.current.push(timeoutId);

              // Exit the loop - we found a move for this iteration
              return prevPuzzle;
            }
          }
        }

        // If we get here, no valid move was found - puzzle might be solved or stuck
        clearInterval(interval);
        setIsAutoSolving(false);
        setHintCell(null);
        autoSolveTimeoutIdsRef.current = [];
        return prevPuzzle;
      });
    }, 3000); // 3 seconds between moves

    setAutoSolveIntervalId(interval);
  };

  const handleCancelAutoSolution = () => {
    if (autoSolveIntervalId) {
      clearInterval(autoSolveIntervalId);
      setAutoSolveIntervalId(null);
    }
    // Clear all pending timeouts
    autoSolveTimeoutIdsRef.current.forEach((timeoutId: NodeJS.Timeout) => clearTimeout(timeoutId));
    autoSolveTimeoutIdsRef.current = [];
    setIsAutoSolving(false);
    setHintCell(null);
    // Note: hintsUsedThisGame remains > 0, so stats still reflect solution usage
  };

  const handlePuzzleSolved = async (solvedPuzzle: DailyPuzzle) => {
    console.log(`[STATS-EVENT ${new Date().toISOString()}] Game won - puzzle ID: ${solvedPuzzle.dateString}, userScore: ${solvedPuzzle.userMovesUsed}, algoScore: ${solvedPuzzle.algoScore}, difficulty: ${settings.difficultyLevel}`);
    
    // 1. Update local win modal stats immediately for instant UI display
    setWinModalStats(prevStats => {
      if (!prevStats) {
        // First win of the day - initialize with basic values
        return {
          totalAttempts: attemptsByDifficulty[settings.difficultyLevel],
          currentPuzzleCompletedStreak: 1,
          currentTieBotStreak: solvedPuzzle.userMovesUsed <= solvedPuzzle.algoScore ? 1 : 0,
          currentFirstTryStreak: isFirstTryOfDay && hintsUsedThisGame === 0 && solvedPuzzle.userMovesUsed <= solvedPuzzle.algoScore ? 1 : 0,
          difficulty: settings.difficultyLevel,
        };
      }
      // Subsequent wins - increment attempt count, keep streaks as-is for now
      return {
        ...prevStats,
        totalAttempts: attemptsByDifficulty[settings.difficultyLevel],
        difficulty: settings.difficultyLevel,
      };
    });
    
    // 2. Show modal immediately with local/optimistic stats
    setShowWinModal(true);
    
    // 3. Record puzzle history in the background (don't await to avoid UI delay)
    console.log(`[HISTORY] Sending to backend - States: ${userStateHistory.length}, Actions: ${userActionHistory.length}, Moves: ${solvedPuzzle.userMovesUsed}`);
    recordPuzzleHistory({
      puzzle_id: solvedPuzzle.dateString,
      difficulty: settings.difficultyLevel,
      attemptNumber: attemptsByDifficulty[settings.difficultyLevel],
      moves: solvedPuzzle.userMovesUsed,
      hintUsed: hintsUsedThisGame > 0,
      botMoves: solvedPuzzle.algoScore,
      win_loss: 'win',
      states: userStateHistory,
      actions: userActionHistory,
      targetColor: solvedPuzzle.targetColor,
      colorMap: firestoreData?.colorMap
    }).finally(() => {
      // Clear history after recording to prevent memory buildup
      setUserStateHistory([]);
      setUserActionHistory([]);
      setHasRecordedCompletion(true);

      // 4. Fetch fresh stats from backend in the background to get accurate streaks
      getWinModalStatsCallable({ puzzleId: solvedPuzzle.dateString, difficulty: settings.difficultyLevel })
        .then(resp => {
          const data = resp.data as any;
          if (data?.success && data?.stats) {
            console.log('GameContext: Updating win modal stats with fresh data from backend.');
            setWinModalStats({
              totalAttempts: data.stats.totalAttempts ?? null,
              currentPuzzleCompletedStreak: data.stats.currentPuzzleCompletedStreak ?? null,
              currentTieBotStreak: data.stats.currentTieBotStreak ?? null,
              currentFirstTryStreak: data.stats.currentFirstTryStreak ?? null,
              difficulty: settings.difficultyLevel,
            });
          }
        })
        .catch(e => {
          console.error('Failed fetching fresh win modal stats:', e);
          // Keep the optimistic local stats if fetch fails
        });
    });
  };

  const handleTryAgain = async () => {
    if (!puzzle || !firestoreData) {
      setError("Cannot reset game state.");
      return;
    }

    console.log(`[STATS-EVENT ${new Date().toISOString()}] User clicked Try Again - puzzle ID: ${puzzle.dateString}, moves: ${movesThisAttempt}, hints: ${hintsUsedThisGame}, isSolved: ${puzzle.isSolved}, isLost: ${puzzle.isLost}.`);

    // Cancel any running bot solution
    if (autoSolveIntervalId) {
      clearInterval(autoSolveIntervalId);
      setAutoSolveIntervalId(null);
    }
    // Clear all pending timeouts
    autoSolveTimeoutIdsRef.current.forEach((timeoutId: NodeJS.Timeout) => clearTimeout(timeoutId));
    autoSolveTimeoutIdsRef.current = [];
    setIsAutoSolving(false);

    // If a bot solution was used, make a last attempt to persist hintUsed without counting stats
    if (hasUsedBotSolutionThisAttempt && puzzle) {
      try {
        await setHintUsedForPuzzleCallable({
          puzzleId: puzzle.dateString,
          difficulty: settings.difficultyLevel
        });
      } catch (err) {
        console.error('Failed to persist hint usage before reset', err);
      }
    }

    // Always record a loss when the user clicks Try Again if not already recorded
    // Skip recording if a bot solution was used on this attempt (we don't count those attempts)
    if (!hasRecordedCompletion && !hasUsedBotSolutionThisAttempt) {
      recordPuzzleHistory({
        puzzle_id: puzzle.dateString,
        difficulty: settings.difficultyLevel,
        attemptNumber: attemptsByDifficulty[settings.difficultyLevel],
        moves: movesThisAttempt,
        hintUsed: hintsUsedThisGame > 0,
        botMoves: puzzle.algoScore,
        win_loss: 'loss',
        states: userStateHistory,
        actions: userActionHistory,
        targetColor: puzzle.targetColor,
        colorMap: firestoreData?.colorMap
      });
      setHasRecordedCompletion(true);
    }

    try {
      setLoading(true);
      const newPuzzle = generatePuzzleFromDB(
        firestoreData,
        DATE_TO_USE,
        settings,
        { skipDifficultyAdjustments: true }
      );
      setPuzzle(newPuzzle);

      // Reset attempt-specific state (increment only current difficulty)
      setAttemptsByDifficulty(prev => ({
        ...prev,
        [settings.difficultyLevel]: prev[settings.difficultyLevel] + 1
      }));
      setIsFirstTryOfDay(false);
      setHintsUsedThisGame(0);
      setMovesThisAttempt(0);
      setUserStateHistory([]);
      setUserActionHistory([]);
      setIsLostReported(false);
      setHasRecordedCompletion(false);
      setHasUsedBotSolutionThisAttempt(false);

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
    updateSettings(newSettings);
  };

  const handleAutoComplete = async () => {
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

      // 3. Update local state with the additional moves for UI/state consistency
      setMovesThisAttempt(finalMovesForThisAttempt);

      // 4. Apply the autocomplete to the actual puzzle state for UI update
      const completedPuzzle = autoCompletePuzzle(puzzle);
      setPuzzle(completedPuzzle);
      setShowAutocompleteModal(false);

      // 5. Update local win modal stats immediately for instant UI display
      setWinModalStats(prevStats => {
        if (!prevStats) {
          // First win of the day - initialize with basic values
          return {
            totalAttempts: attemptsByDifficulty[settings.difficultyLevel],
            currentPuzzleCompletedStreak: 1,
            currentTieBotStreak: completedPuzzle.userMovesUsed <= completedPuzzle.algoScore ? 1 : 0,
            currentFirstTryStreak: isFirstTryOfDay && hintsUsedThisGame === 0 && completedPuzzle.userMovesUsed <= completedPuzzle.algoScore ? 1 : 0,
            difficulty: settings.difficultyLevel,
          };
        }
        // Subsequent wins - increment attempt count, keep streaks as-is for now
        return {
          ...prevStats,
          totalAttempts: attemptsByDifficulty[settings.difficultyLevel],
          difficulty: settings.difficultyLevel,
        };
      });

      // 6. Show modal immediately with local/optimistic stats
      setShowWinModal(true);

      // 7. Record the win in the background
      console.log(`[STATS-EVENT ${new Date().toISOString()}] Game won via Autocomplete - puzzle ID: ${completedPuzzle.dateString}, difficulty: ${settings.difficultyLevel}`);
      recordPuzzleHistory({
        puzzle_id: completedPuzzle.dateString,
        difficulty: settings.difficultyLevel,
        attemptNumber: attemptsByDifficulty[settings.difficultyLevel],
        moves: completedPuzzle.userMovesUsed,
        hintUsed: hintsUsedThisGame > 0,
        botMoves: completedPuzzle.algoScore,
        win_loss: 'win',
        states: userStateHistory,
        actions: userActionHistory,
        targetColor: completedPuzzle.targetColor,
        colorMap: firestoreData?.colorMap
      }).finally(() => {
        // Clear history after recording to prevent memory buildup
        setUserStateHistory([]);
        setUserActionHistory([]);
        setHasRecordedCompletion(true);
        
        // 8. Fetch fresh stats from backend in the background to get accurate streaks
        getWinModalStatsCallable({ puzzleId: completedPuzzle.dateString, difficulty: settings.difficultyLevel })
          .then(resp => {
            const data = resp.data as any;
            if (data?.success && data?.stats) {
              console.log('GameContext: Updating win modal stats with fresh data from backend (autocomplete).');
              setWinModalStats({
                totalAttempts: data.stats.totalAttempts ?? null,
                currentPuzzleCompletedStreak: data.stats.currentPuzzleCompletedStreak ?? null,
                currentTieBotStreak: data.stats.currentTieBotStreak ?? null,
                currentFirstTryStreak: data.stats.currentFirstTryStreak ?? null,
                difficulty: settings.difficultyLevel,
              });
            }
          })
          .catch(e => {
            console.error('Failed fetching fresh win modal stats:', e);
            // Keep the optimistic local stats if fetch fails
          });
      });
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
          // Fetch fresh stats when the modal is opened (checks cache first)
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
    winModalStats,
    
    handleTileClick,
    handleColorSelect,
    closeColorPicker,
    handleTryAgain,
    resetLostState,
    handleBotSolutionClick,
    handleBotSolutionConfirm,
    handleCancelAutoSolution,
    isAutoSolving,
    showBotSolutionModal,
    setShowBotSolutionModal,
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
