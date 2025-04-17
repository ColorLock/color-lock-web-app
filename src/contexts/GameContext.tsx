import React, { createContext, useState, useEffect, useContext, ReactNode, useRef, useCallback } from 'react';
import { TileColor, DailyPuzzle, FirestorePuzzleData } from '../types';
import { AppSettings, defaultSettings, DifficultyLevel } from '../types/settings';
import { GameStatistics, defaultStats } from '../types/stats';
import { HintResult } from '../utils/hintUtils';
import { fetchPuzzle, functions } from '../services/firebaseService';
import { getFunctions, Functions } from 'firebase/functions';
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

  // --- Utility Function ---
  const callUpdateStats = useCallback(async (data: any) => {
      console.log(`[Stats ${new Date().toISOString()}] callUpdateStats invoked with event: ${data.eventType}, puzzleId: ${data.puzzleId}`);
      
      if (!currentUser && !(process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost')) {
          console.error(`[Stats ${new Date().toISOString()}] No Firebase user logged in. Cannot update stats.`);
          setError("You must be logged in to save statistics.");
          return null;
      }

      const userId = currentUser?.uid || 'dev-user';
      console.log(`[Stats ${new Date().toISOString()}] Preparing API request for user: ${userId}`);
      console.log(`[Stats ${new Date().toISOString()}] Full payload:`, JSON.stringify(data));
      
      try {
          console.log(`[Stats ${new Date().toISOString()}] Sending request to API Gateway...`);
          const startTime = performance.now();
          
          // Determine if we're in local development environment
          const isLocal = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';
          
          // Prepare auth token
          let idToken = '';
          if (currentUser) {
              try {
                  idToken = await currentUser.getIdToken();
              } catch (tokenError) {
                  console.error(`[Stats ${new Date().toISOString()}] Failed to get ID token:`, tokenError);
                  if (!isLocal) throw tokenError; // Only throw in production
              }
          }
          
          // Determine the API endpoint
          let apiUrl: string;
          if (isLocal) {
              // Use emulator endpoint for local development
              apiUrl = 'http://localhost:5001/color-lock-prod/us-central1/updateUserStatsHttp';
              console.log(`[Stats ${new Date().toISOString()}] Using emulator endpoint: ${apiUrl}`);
          } else {
              // Use API Gateway in production
              const gatewayUrl = import.meta.env.VITE_API_GATEWAY_URL;
              if (!gatewayUrl) {
                  throw new Error('API Gateway URL is not configured');
              }
              apiUrl = `${gatewayUrl}/updateUserStats`;
              console.log(`[Stats ${new Date().toISOString()}] Using API Gateway: ${apiUrl}`);
          }
          
          // Prepare headers
          const headers: Record<string, string> = {
              'Content-Type': 'application/json',
          };
          
          if (idToken) {
              headers['Authorization'] = `Bearer ${idToken}`;
          }
          
          // For emulator testing
          if (isLocal && currentUser?.uid) {
              headers['X-Emulator-User-Id'] = currentUser.uid;
          }
          
          // Make the fetch request
          const response = await fetch(apiUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(data),
          });
          
          const duration = (performance.now() - startTime).toFixed(2);
          console.log(`[Stats ${new Date().toISOString()}] API request completed in ${duration}ms`);
          
          if (!response.ok) {
              const errorText = await response.text();
              console.error(`[Stats ${new Date().toISOString()}] API responded with error ${response.status}:`, errorText);
              throw new Error(`API Error (${response.status}): ${errorText}`);
          }
          
          const result = await response.json();
          console.log(`[Stats ${new Date().toISOString()}] Result:`, result);
          
          // Check for success AND updatedStats
          if (result?.success && result.updatedStats) {
             console.log(`[Stats ${new Date().toISOString()}] Backend update successful. Updating local state.`);
             // Update local gameStats state using setFreshStats with the allTimeStats from backend
             setFreshStats(result.updatedStats);
             return result; // Return full result if needed elsewhere
          } else if (result?.success) {
             console.warn(`[Stats ${new Date().toISOString()}] Backend reported success but did not return updatedStats.`);
             return result;
          } else {
             // Handle cases where backend explicitly returned success: false
             console.error(`[Stats ${new Date().toISOString()}] Backend function reported failure.`);
             setError(`Failed to update stats: Backend error`);
             return null;
          }
      } catch (error: any) {
          console.error(`[Stats ${new Date().toISOString()}] Error calling updateUserStats:`, error);
          console.error(`[Stats ${new Date().toISOString()}] Error details:`, error.message, error.code, error.details);
          setError(`Failed to update stats: ${error.message || 'Unknown error'}`);
          return null;
      }
  }, [currentUser, setFreshStats]);
  
  const fetchAndSetUserStats = useCallback(async () => {
      if (!currentUser && !(process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost')) {
          console.error("No Firebase user logged in. Cannot fetch stats.");
          setError("You must be logged in to view statistics.");
          return;
      }

      console.log("Fetching user stats...");
      setIsLoadingStats(true);
      try {
          // Check if we're in the local/development environment
          const isLocal = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';
          
          // Prepare auth token
          let idToken = '';
          if (currentUser) {
              try {
                  idToken = await currentUser.getIdToken();
              } catch (tokenError) {
                  console.error(`Failed to get ID token:`, tokenError);
                  if (!isLocal) throw tokenError; // Only throw in production
              }
          }
          
          // Determine the API endpoint
          let apiUrl: string;
          if (isLocal) {
              // Use emulator endpoint for local development
              apiUrl = 'http://localhost:5001/color-lock-prod/us-central1/getUserStatsHttp';
              console.log(`Using emulator endpoint for stats: ${apiUrl}`);
          } else {
              // Use API Gateway in production
              const gatewayUrl = import.meta.env.VITE_API_GATEWAY_URL;
              if (!gatewayUrl) {
                  throw new Error('API Gateway URL is not configured');
              }
              apiUrl = `${gatewayUrl}/getUserStats`;
              console.log(`Using API Gateway for stats: ${apiUrl}`);
          }
          
          // Prepare headers
          const headers: Record<string, string> = {
              'Content-Type': 'application/json',
          };
          
          if (idToken) {
              headers['Authorization'] = `Bearer ${idToken}`;
          }
          
          // For emulator testing
          if (isLocal && currentUser?.uid) {
              headers['X-Emulator-User-Id'] = currentUser.uid;
          }
          
          // Make the fetch request
          const response = await fetch(apiUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({}),
          });
          
          if (!response.ok) {
              const errorText = await response.text();
              console.error(`API responded with error ${response.status}:`, errorText);
              throw new Error(`API Error (${response.status}): ${errorText}`);
          }
          
          const statsData = await response.json();
          console.log("getUserStats result:", statsData);
          
          if (statsData && statsData.success && statsData.stats) {
              const currentTodayStats = gameStats.todayStats;
              setFreshStats(statsData.stats);
              setError(null);
          } else {
              throw new Error(statsData?.error || 'Failed to fetch stats');
          }
      } catch (error: any) {
          console.error("Error fetching user stats:", error);
          setError(`Failed to fetch stats: ${error.message || 'Unknown error'}`);
      } finally {
          setIsLoadingStats(false);
      }
  }, [currentUser, setIsLoadingStats, setFreshStats, gameStats.todayStats]);

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

  // Load puzzle on mount
  useEffect(() => {
    const loadPuzzle = async () => {
      try {
        setLoading(true);
        setError(null); // Clear previous errors
        console.log(`Attempting to fetch puzzle for date: ${DATE_TO_USE}`);
        
        // Add retry logic with timeout
        let fetchedFirestoreData = null;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries && !fetchedFirestoreData) {
          try {
            if (retryCount > 0) {
              console.log(`Retrying puzzle fetch (attempt ${retryCount + 1}/${maxRetries})...`);
              // Small delay before retry to allow auth to complete
              await new Promise(r => setTimeout(r, 1500));
            }
            
            fetchedFirestoreData = await fetchPuzzle(DATE_TO_USE);
            console.log('Successfully fetched puzzle data');
          } catch (fetchErr) {
            retryCount++;
            const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            
            // If this is the final retry, throw to be caught by outer try/catch
            if (retryCount >= maxRetries) {
              console.error(`Failed to fetch puzzle after ${maxRetries} attempts:`, fetchErr);
              throw fetchErr;
            }
            
            // For auth errors, wait longer to give auth time to initialize
            if (errMsg.includes('Authentication required')) {
              console.warn('Authentication not ready, waiting before retry...');
              await new Promise(r => setTimeout(r, 2000));
            }
          }
        }
        
        if (!fetchedFirestoreData) {
          throw new Error('Failed to fetch puzzle data after multiple attempts');
        }

        setFirestoreData(fetchedFirestoreData);
        const newPuzzle = generatePuzzleFromDB(fetchedFirestoreData, DATE_TO_USE, settings);
        setPuzzle(newPuzzle);

        // Reset attempt state for the new puzzle/day
        setAttemptNumberToday(1); // Assume 1st attempt until loaded otherwise
        setIsFirstTryOfDay(true);
        setHintsUsedThisGame(0);
        setMovesThisAttempt(0);
        setHasMadeFirstMove(false);
        setIsLostReported(false); // Reset loss reported flag

      } catch (err) {
        console.error('Error fetching puzzle:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('Authentication required')) {
             setError('Authentication failed. Please log in or play as guest.');
        } else if (errMsg.includes('Puzzle not found')) {
             setError(`Today's puzzle (${DATE_TO_USE}) is not available yet. Please check back later.`);
        } else if (window.location.hostname === 'localhost') {
             console.error('Puzzle fetch failed in local development. Ensure emulators are running and seeded (`npm run cursor-dev` or `npm run local-test`).');
             setError('Local dev: Failed to load puzzle. Check emulators and console.');
        } else {
             setError('Unable to load puzzle. Please check your connection and try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    // Load initial stats for display
    loadInitialStats(); // Load stats from storage

    loadPuzzle();
  }, [DATE_TO_USE, settings.difficultyLevel, loadInitialStats]); // Rerun if difficulty changes to regen puzzle

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