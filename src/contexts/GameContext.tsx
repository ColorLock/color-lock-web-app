import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import { TileColor, DailyPuzzle, FirestorePuzzleData } from '../types';
import { AppSettings, DifficultyLevel } from '../types/settings';
import { GameStatistics, defaultStats } from '../types/stats';
import { HintResult } from '../utils/hintUtils';
import {
    fetchPuzzleV2Callable,
    getPersonalStatsCallable,
    recordPuzzleHistoryCallable,
    getWinModalStatsCallable
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

  // Local state for tracking attempt details (per-difficulty)
  const [attemptsByDifficulty, setAttemptsByDifficulty] = useState<{
    easy: number;
    medium: number;
    hard: number;
  }>({ easy: 1, medium: 1, hard: 1 });
  const [isFirstTryOfDay, setIsFirstTryOfDay] = useState<boolean>(true);
  const [hintsUsedThisGame, setHintsUsedThisGame] = useState<number>(0);
  const [movesThisAttempt, setMovesThisAttempt] = useState<number>(0);
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
            setIsLostReported(false);
            setHasRecordedCompletion(false);
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
          setIsLostReported(false);
          setHasRecordedCompletion(false);
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
    if (puzzle && !puzzle.isSolved && !puzzle.isLost && shouldShowAutocomplete(puzzle) && !hasDeclinedAutocomplete) {
      setShowAutocompleteModal(true);
    }
  }, [puzzle, hasDeclinedAutocomplete]);

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
            win_loss: 'loss'
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

    // Increment local move counter
    const newMovesThisAttempt = movesThisAttempt + 1;
    setMovesThisAttempt(newMovesThisAttempt);

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
      console.log(`[HINT ${new Date().toISOString()}] Hint used at position [${hint.row},${hint.col}] - puzzle ID: ${puzzle.dateString}. Attempt number: ${attemptsByDifficulty[settings.difficultyLevel]}`);
    } else {
      console.log("No valid hint could be generated.");
    }
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
    recordPuzzleHistory({
      puzzle_id: solvedPuzzle.dateString,
      difficulty: settings.difficultyLevel,
      attemptNumber: attemptsByDifficulty[settings.difficultyLevel],
      moves: solvedPuzzle.userMovesUsed,
      hintUsed: hintsUsedThisGame > 0,
      botMoves: solvedPuzzle.algoScore,
      win_loss: 'win'
    }).finally(() => {
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

    // Always record a loss when the user clicks Try Again if not already recorded
    if (!hasRecordedCompletion) {
      recordPuzzleHistory({
        puzzle_id: puzzle.dateString,
        difficulty: settings.difficultyLevel,
        attemptNumber: attemptsByDifficulty[settings.difficultyLevel],
        moves: movesThisAttempt,
        hintUsed: hintsUsedThisGame > 0,
        botMoves: puzzle.algoScore,
        win_loss: 'loss'
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
      setIsLostReported(false);
      setHasRecordedCompletion(false);

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
        win_loss: 'win'
      }).finally(() => {
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
