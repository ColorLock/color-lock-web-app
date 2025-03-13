import { fetchPuzzleFromFirestore } from './firebase_client';
import React, { useState, useEffect, useContext, createContext } from 'react';
import './App.css';
import { getHint, HintResult, getValidActions, computeActionDifference, NUM_COLORS } from './hints';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faCopy, faGear, faXmark, faTrophy } from '@fortawesome/free-solid-svg-icons';
import { faTwitter, faFacebookF } from '@fortawesome/free-brands-svg-icons';
import SettingsModal, { AppSettings, defaultSettings, ColorBlindMode } from './SettingsModal';
import StatsModal, { GameStatistics, defaultStats } from './StatsModal';
import ReactConfetti from 'react-confetti';


// -------------------------------------------------------------------------
// 1. Types & Data
// -------------------------------------------------------------------------

export enum TileColor {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
  Yellow = 'yellow',
  Purple = 'purple',
  Orange = 'orange'
}

const allColors = [
  TileColor.Red,
  TileColor.Green,
  TileColor.Blue,
  TileColor.Yellow,
  TileColor.Purple,
  TileColor.Orange
];

// Example daily goals (optional)
const dailyGoalData: Record<string, number> = {
  '2025-03-05': 10,
  '2025-03-06': 8,
  '2025-03-07': 10
};

interface DailyPuzzle {
  dateString: string;
  grid: TileColor[][];
  userMovesUsed: number;
  isSolved: boolean;
  isLost: boolean;
  lockedCells: Set<string>;
  targetColor: TileColor;
  startingGrid: TileColor[][]; // Deep-copied initial grid
  bestScoreUsed: number | null;
  timesPlayed: number;
  totalMovesForThisBoard: number;
  algoScore: number;
}

export interface PuzzleGrid {
  [row: string]: TileColor[];
}

// Define the Firestore data structure
export interface FirestorePuzzleData {
  algoScore: number;
  targetColor: TileColor;
  states: PuzzleGrid[];
  actions: number[];
  colorMap?: number[];
}


// -------------------------------------------------------------------------
// 2. Utility Functions
// -------------------------------------------------------------------------

/**
 * Creates a date-based seed:
 *   seed = y * 10000 + m * 100 + d
 * (if the result is 0, use 0xDEADBEEF)
 */
function stableSeedForDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const combined = y * 10000 + m * 100 + d;
  const seed = combined === 0 ? 0xDEADBEEF : combined;
  console.log(`Generating base seed for date ${dateStr}: ${seed}`);
  return seed;
}

/**
 * A 64-bit xorshift RNG matching the Swift version.
 */
function createSwiftSeededGenerator(seed: number) {
  // Convert to BigInt for 64-bit precision
  let state = BigInt(seed);
  console.log(`Initial RNG state: ${state}`);
  
  // For debugging: track every random value generated
  const generatedNumbers: number[] = [];

  function nextUInt64(): bigint {
    // XorShift64 algorithm - must match Swift exactly
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    return state;
  }

  // Ensure nextIntInRange behaves exactly like Swift
  function nextIntInRange(upperBound: number): number {
    // Swift's Int.random(in: 0..<upperBound, using: &rng)
    const range = BigInt(upperBound);
    if (range <= 1n) return 0;
    
    // This matches Swift's implementation for uniform distribution
    const threshold = (0xFFFFFFFFFFFFFFFFn - range + 1n) % range;
    
    let value;
    while (true) {
      value = nextUInt64() & 0xFFFFFFFFFFFFFFFFn; // Ensure positive values only
      if (value >= threshold) {
        const result = Number(value % range);
        generatedNumbers.push(result);
        return result;
      }
    }
  }

  return { 
    nextIntInRange,
    getGeneratedNumbers: () => generatedNumbers
  };
}

/**
 * Flood fill: returns arrays of row and column indices that were changed.
 */
function floodFill(
  grid: TileColor[][],
  row: number,
  col: number,
  oldColor: TileColor
): [number[], number[]] {
  const visited = new Set<string>();
  const stack = [[row, col]];
  const rowsChanged: number[] = [];
  const colsChanged: number[] = [];
  const size = grid.length;

  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    if (r < 0 || r >= size || c < 0 || c >= size) continue;
    if (grid[r][c] !== oldColor) continue;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;

    visited.add(key);
    rowsChanged.push(r);
    colsChanged.push(c);

    stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
  }
  return [rowsChanged, colsChanged];
}

/**
 * Finds the largest connected region of the same color in the grid.
 */
function findLargestRegion(grid: TileColor[][]): Set<string> {
  const visited = new Set<string>();
  let largestRegion: string[] = [];
  const size = grid.length;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const key = `${r},${c}`;
      if (!visited.has(key)) {
        const color = grid[r][c];
        const stack = [[r, c]];
        const currentRegion: string[] = [];

        while (stack.length > 0) {
          const [rr, cc] = stack.pop()!;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          const k2 = `${rr},${cc}`;
          if (visited.has(k2)) continue;
          if (grid[rr][cc] !== color) continue;

          visited.add(k2);
          currentRegion.push(k2);
          
          // Make sure we push neighbors in the same order as Swift
          // This is critical for matching results exactly!
          stack.push([rr + 1, cc], [rr - 1, cc], [rr, cc + 1], [rr, cc - 1]);
        }
        
        if (currentRegion.length > largestRegion.length) {
          largestRegion = currentRegion;
        }
      }
    }
  }
  return new Set(largestRegion);
}

/**
 * Checks if the entire grid is a single color.
 */
function isBoardUnified(grid: TileColor[][]): boolean {
  const first = grid[0][0];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid.length; c++) {
      if (grid[r][c] !== first) return false;
    }
  }
  return true;
}

// Optionally store / load puzzle to mimic "UserDefaults" from Swift
function dateKeyForToday(): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = (today.getMonth() + 1).toString().padStart(2, '0');
  const d = today.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function loadDailyPuzzleIfExists(key: string): DailyPuzzle | null {
  try {
    const data = localStorage.getItem(key);
    if (!data) return null;
    const parsed = JSON.parse(data) as DailyPuzzle & { lockedCells: string[] };
    // Reconstruct lockedCells as a Set after loading
    return { ...parsed, lockedCells: new Set(parsed.lockedCells) };
  } catch {
    return null;
  }
}

function saveDailyPuzzle(puzzle: DailyPuzzle) {
  try {
    // Convert lockedCells to an array before saving
    const puzzleData = { ...puzzle, lockedCells: Array.from(puzzle.lockedCells) };
    localStorage.setItem(puzzle.dateString, JSON.stringify(puzzleData));
  } catch {
    // ignore
  }
}

// -------------------------------------------------------------------------
// 3. Puzzle Generation
// -------------------------------------------------------------------------


function generatePuzzleFromDB(firestoreData: FirestorePuzzleData, dateStr: string): DailyPuzzle {
  // Get the first state from the states list
  const initialState = firestoreData.states[0];
  
  // Get the grid size from the first state object
  const gridSize = Object.keys(initialState).length;
  
  // Initialize an empty 2D array for the grid
  const grid: TileColor[][] = [];
  
  // Convert the object-based initialState to a 2D array
  for (let r = 0; r < gridSize; r++) {
    // Get the row array from initialState using the string index
    const rowKey = r.toString();
    const rowColors = initialState[rowKey] as TileColor[];
    grid.push(rowColors);
  }
  
  // Log the exact sequence of random numbers generated
  console.log("Generated grid from firebase");
  
  // Use the same algorithm for finding the largest region
  const locked = findLargestRegion(grid);
  
  console.log("Web: Generated grid for", dateStr, ":", grid);
  // console.log("Web: Target color:", target);
  console.log("Web: Locked cells:", locked);
  // Print locked cells in a format easy to compare with Swift
  console.log("Locked cells as array:", Array.from(locked));

  return {
    dateString: dateStr,
    grid,
    userMovesUsed: 0,
    isSolved: false,
    isLost: false,
    lockedCells: locked,
    targetColor: firestoreData.targetColor,
    startingGrid: grid.map(row => [...row]),
    bestScoreUsed: null,
    timesPlayed: 0,
    totalMovesForThisBoard: 0,
    algoScore: firestoreData.algoScore
  };
}

// -------------------------------------------------------------------------
// 4. Main App Component
// -------------------------------------------------------------------------

// Create settings context
export const SettingsContext = createContext<AppSettings | null>(null);

const App: React.FC = () => {
  const GRID_SIZE = 5;
  const DATE_TO_USE = dateKeyForToday();

  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedTile, setSelectedTile] = useState<{ row: number; col: number } | null>(null);
  const [showWinModal, setShowWinModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hintCell, setHintCell] = useState<HintResult | null>(null);
  const [firestoreData, setFirestoreData] = useState<FirestorePuzzleData | null>(null);
  const [isOnOptimalPath, setIsOnOptimalPath] = useState(true);
  const [moveCount, setMoveCount] = useState(0);
  const [nextPuzzleTime, setNextPuzzleTime] = useState<{hours: string, minutes: string, seconds: string}>({
    hours: "00",
    minutes: "00",
    seconds: "00"
  });
  const [timeLeft, setTimeLeft] = useState<string>("23:59:59");

  // Add settings state
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    // Load settings from localStorage on initial render
    const savedSettings = localStorage.getItem('colorLockSettings');
    if (savedSettings) {
      try {
        return JSON.parse(savedSettings);
      } catch (e) {
        console.error('Failed to parse saved settings', e);
      }
    }
    return defaultSettings;
  });

  // Add statistics state
  const [showStats, setShowStats] = useState(false);
  const [gameStats, setGameStats] = useState<GameStatistics>(() => {
    // Load stats from localStorage on initial render
    const savedStats = localStorage.getItem('colorLockStats');
    if (savedStats) {
      try {
        return JSON.parse(savedStats);
      } catch (e) {
        console.error('Failed to parse saved stats', e);
      }
    }
    return { ...defaultStats };
  });
  
  // Track game start time for calculating time spent
  const [gameStartTime, setGameStartTime] = useState<Date | null>(null);

  const [windowDimensions, setWindowDimensions] = useState<{width: number, height: number}>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [confettiActive, setConfettiActive] = useState<boolean>(true);
  const [showShareButtons, setShowShareButtons] = useState<boolean>(false);

  // Load game statistics
  const loadGameStats = (): GameStatistics => {
    const savedStats = localStorage.getItem('colorLockStats');
    if (savedStats) {
      try {
        return JSON.parse(savedStats);
      } catch (e) {
        console.error('Failed to parse saved stats', e);
        return { ...defaultStats };
      }
    }
    return { ...defaultStats };
  };

  // Save game statistics
  const saveGameStats = (stats: GameStatistics) => {
    localStorage.setItem('colorLockStats', JSON.stringify(stats));
    setGameStats(stats);
  };

  // Update daily stats with current game data
  const updateGameStats = (isSolved: boolean) => {
    const currentDate = dateKeyForToday();
    const currentStats = loadGameStats();
    const timeSpent = gameStartTime ? Math.floor((new Date().getTime() - gameStartTime.getTime()) / 1000) : 0;
    
    // Update today's stats
    const todayStats = {
      movesUsed: moveCount,
      bestScore: currentStats.todayStats.bestScore === null || moveCount < currentStats.todayStats.bestScore 
        ? moveCount 
        : currentStats.todayStats.bestScore,
      timeSpent: timeSpent
    };
    
    // Calculate daily scores for the mini chart
    const dailyScores = { ...currentStats.allTimeStats.dailyScores };
    if (isSolved) {
      dailyScores[currentDate] = moveCount;
    }
    
    // Calculate streak
    let streak = currentStats.allTimeStats.streak;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split('T')[0];
    
    if (isSolved) {
      // If yesterday is in our records, increment streak, otherwise reset to 1
      if (dailyScores[yesterdayKey] !== undefined) {
        streak += 1;
      } else {
        streak = 1;
      }
    }
    
    // Calculate other all-time stats
    const gamesPlayed = currentStats.allTimeStats.gamesPlayed + 1;
    const winCount = Object.keys(dailyScores).length;
    const winPercentage = gamesPlayed > 0 ? (winCount / gamesPlayed) * 100 : 0;
    
    // Calculate average moves per solve
    const totalMoves = Object.values(dailyScores).reduce((sum, moves) => sum + moves, 0);
    const averageMovesPerSolve = winCount > 0 ? totalMoves / winCount : 0;
    
    // Find best score ever
    const allScores = Object.values(dailyScores);
    const bestScoreEver = allScores.length > 0 ? Math.min(...allScores) : null;
    
    // Update all-time stats
    const allTimeStats = {
      gamesPlayed,
      winPercentage,
      averageMovesPerSolve,
      bestScoreEver,
      streak,
      dailyScores
    };
    
    // Save updated stats
    const updatedStats: GameStatistics = {
      todayStats,
      allTimeStats
    };
    
    saveGameStats(updatedStats);
  };

  // Generate the puzzle for the fixed date on first render.
  useEffect(() => {
    const loadPuzzle = async () => {
      try {
        setLoading(true);
        console.log("Starting puzzle loading process");
        
        // Add a timeout to prevent infinite waiting
        const fetchPuzzleWithTimeout = async (): Promise<FirestorePuzzleData> => {
          const timeout = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Fetch timeout')), 10000)
          );
          
          // Add type assertion to the result of Promise.race
          return Promise.race([
            fetchPuzzleFromFirestore(DATE_TO_USE),
            timeout
          ]) as Promise<FirestorePuzzleData>;
        };
        
        try {
          console.log("Attempting to fetch puzzle from Firestore");
          const firestoreData = await fetchPuzzleWithTimeout();
          console.log("Firestore data received:", firestoreData);
          setFirestoreData(firestoreData);
          const newPuzzle = generatePuzzleFromDB(firestoreData, DATE_TO_USE);
          console.log("Successfully fetched puzzle from Firestore");
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

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('colorLockSettings', JSON.stringify(settings));
  }, [settings]);

  if (loading) {
    return <div className="loading">Loading puzzle...</div>;
  }

  if (!puzzle) {
    return <div>Loading puzzle...</div>;
  }

  // Get the daily goal if available
  const dailyGoal = puzzle.algoScore;

  // Handle tile clicks
  const handleTileClick = (row: number, col: number) => {
    if (puzzle.isSolved || puzzle.isLost) return;
    if (puzzle.lockedCells.has(`${row},${col}`)) return;
    setSelectedTile({ row, col });
    setShowColorPicker(true);
  };

  // Add a utility function to check if the current grid matches the expected state
  const checkIfOnOptimalPath = (grid: TileColor[][], moveNumber: number): boolean => {
    if (!firestoreData || !firestoreData.states || moveNumber >= firestoreData.states.length) {
      return false;
    }
    
    // Get the expected state for the current move number
    const expectedState = firestoreData.states[moveNumber];
    
    // Compare current grid with expected state
    for (let r = 0; r < GRID_SIZE; r++) {
      const rowKey = r.toString();
      if (!expectedState[rowKey]) return false;
      
      const expectedRow = expectedState[rowKey];
      for (let c = 0; c < GRID_SIZE; c++) {
        if (grid[r][c] !== expectedRow[c]) {
          return false;
        }
      }
    }
    
    return true;
  };

  // Modify handleColorSelect to check if user is still on optimal path after each move
  const handleColorSelect = (newColor: TileColor) => {
    if (!selectedTile) return;
    
    // Clear any active hints
    setHintCell(null);
    
    const { row, col } = selectedTile;
    const oldColor = puzzle.grid[row][col];
    if (oldColor === newColor) {
      closeColorPicker();
      return;
    }
    const newGrid = puzzle.grid.map(r => [...r]);
    const [rowsChanged, colsChanged] = floodFill(newGrid, row, col, oldColor);
    rowsChanged.forEach((r, i) => {
      newGrid[r][colsChanged[i]] = newColor;
    });

    let newLockedCells = puzzle.lockedCells;
    let newIsSolved = puzzle.isSolved;
    let newIsLost = puzzle.isLost;
    const newUserMoves = puzzle.userMovesUsed + 1;

    // Update largest region
    const largestRegion = findLargestRegion(newGrid);
    if (largestRegion.size > newLockedCells.size) {
      newLockedCells = largestRegion;
    }

    // If the largest region (>= 13) is not the target color, mark as lost.
    if (largestRegion.size >= 13) {
      const firstCell = largestRegion.values().next().value as string;
      const [fr, fc] = firstCell.split(',').map(Number);
      if (newGrid[fr][fc] !== puzzle.targetColor) {
        newIsLost = true;
      }
    }

    // Check if board is unified.
    if (isBoardUnified(newGrid)) {
      if (newGrid[0][0] === puzzle.targetColor) {
        newIsSolved = true;
        newLockedCells = new Set();
      } else {
        newIsLost = true;
      }
    }

    // NEW: Check if the user is still on the optimal path
    const willBeOnPath = checkIfOnOptimalPath(newGrid, newUserMoves);
    setIsOnOptimalPath(willBeOnPath);
    
    if (!willBeOnPath) {
      console.log("User has deviated from the optimal solution path");
    }

    const updated: DailyPuzzle = {
      ...puzzle,
      grid: newGrid,
      lockedCells: newLockedCells,
      userMovesUsed: newUserMoves,
      isSolved: newIsSolved,
      isLost: newIsLost
    };
    setPuzzle(updated);
    closeColorPicker();

    if (updated.isSolved) {
      handlePuzzleSolved();
    }
  };

  const closeColorPicker = () => {
    setShowColorPicker(false);
    setSelectedTile(null);
  };

  // Update the handleHint function to use dynamic calculation if off-path
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

    let hint: HintResult | null = null;
    
    if (isOnOptimalPath) {
      // User is on the optimal path, use the predefined next action
      console.log("User is on optimal path, providing next predefined action");
      hint = getHint(firestoreData, puzzle.userMovesUsed);
    } else {
      // User has deviated, calculate the best action dynamically
      console.log("User has deviated from optimal path, calculating best action");
      
      // Get all valid actions
      const validActions = getValidActions(puzzle.grid, puzzle.lockedCells, firestoreData);
      
      if (validActions.length === 0) {
        console.log("No valid actions available");
        return;
      }
      
      // Evaluate each action and find the best one(s)
      let bestActions: number[] = [];
      let bestDifference = -Infinity;
      
      validActions.forEach(actionIdx => {
        const difference = computeActionDifference(
          puzzle.grid, 
          puzzle.lockedCells, 
          puzzle.targetColor, 
          actionIdx,
          firestoreData
        );
        
        if (difference > bestDifference) {
          bestDifference = difference;
          bestActions = [actionIdx];
        } else if (difference === bestDifference) {
          bestActions.push(actionIdx);
        }
      });
      
      if (bestActions.length > 0) {
        // If there are ties, choose randomly
        const randomIndex = Math.floor(Math.random() * bestActions.length);
        const bestActionIdx = bestActions[randomIndex];
        
        // Create a hint result from the best action
        hint = decodeActionIdFromApp(bestActionIdx, firestoreData);
        console.log(`Selected best action with difference ${bestDifference}`);
      }
    }
    
    if (hint && hint.valid) {
      console.log("Hint provided:", hint);
      setHintCell(hint);
    } else {
      console.log("No valid hint available");
    }
  };
  
  // Helper function to decode action ID (similar to the one in hints.tsx)
  const decodeActionIdFromApp = (actionId: number, firestoreData: FirestorePuzzleData): HintResult => {
    const row = (GRID_SIZE - 1) - Math.floor(actionId / (GRID_SIZE * NUM_COLORS));
    const remainder = actionId % (GRID_SIZE * NUM_COLORS);
    const col = Math.floor(remainder / NUM_COLORS);
    const colorIndex = remainder % NUM_COLORS;
    
    let newColor: TileColor;
    
    if (firestoreData.colorMap) {
      const mappedIndex = firestoreData.colorMap.indexOf(colorIndex);
      if (mappedIndex !== -1) {
        const colorValues = Object.values(TileColor);
        newColor = colorValues[mappedIndex] as TileColor;
      } else {
        const colorValues = Object.values(TileColor);
        newColor = colorValues[colorIndex] as TileColor;
      }
    } else {
      const colorValues = Object.values(TileColor);
      newColor = colorValues[colorIndex] as TileColor;
    }
    
    return {
      row,
      col,
      newColor,
      valid: row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE
    };
  };

  const handlePuzzleSolved = () => {
    // Update statistics when puzzle is solved
    updateGameStats(true);
    setShowWinModal(true);
  };

  // Reset isOnOptimalPath when trying again
  const handleTryAgain = async () => {
    try {
      // If the player resets and doesn't solve the puzzle, count it as a played game
      if (puzzle && !puzzle.isSolved) {
        updateGameStats(false);
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
      setMoveCount(0);
      setGameStartTime(new Date()); // Reset start time
    } catch (error) {
      console.error("Error in try again:", error);
      setError("Couldn't load new puzzle. Please refresh the page.");
    } finally {
      setShowWinModal(false);
    }
  };

  // More detailed locked region analysis
  function getLockedRegionsInfo(grid: TileColor[][], lockedCells: Set<string>): { 
    totalSize: number, 
    regions: number[]  // Array of sizes of each connected region
  } {
    if (lockedCells.size === 0) {
      return { totalSize: 0, regions: [] };
    }
    
    // Convert locked cells to array of [row, col] pairs
    const lockedCoords: [number, number][] = Array.from(lockedCells).map(key => {
      const [row, col] = key.split(',').map(Number);
      return [row, col];
    });
    
    // Track visited cells
    const visited = new Set<string>();
    const regions: number[] = [];
    
    // For each locked cell
    for (const [startRow, startCol] of lockedCoords) {
      const key = `${startRow},${startCol}`;
      if (visited.has(key)) continue;
      
      // Start a new region
      const stack: [number, number][] = [[startRow, startCol]];
      let regionSize = 0;
      
      // Flood fill to find connected cells
      while (stack.length > 0) {
        const [row, col] = stack.pop()!;
        const cellKey = `${row},${col}`;
        
        if (visited.has(cellKey)) continue;
        if (!lockedCells.has(cellKey)) continue;
        
        visited.add(cellKey);
        regionSize++;
        
        // Check neighbors
        const neighbors: [number, number][] = [
          [row+1, col], [row-1, col], [row, col+1], [row, col-1]
        ];
        
        for (const [nr, nc] of neighbors) {
          const neighborKey = `${nr},${nc}`;
          if (!visited.has(neighborKey) && lockedCells.has(neighborKey)) {
            stack.push([nr, nc]);
          }
        }
      }
      
      regions.push(regionSize);
    }
    
    // Sort regions by size (largest first)
    regions.sort((a, b) => b - a);
    
    return {
      totalSize: lockedCells.size,
      regions
    };
  }

  // Function to calculate locked region size
  const getLockedRegionSize = () => {
    return puzzle?.lockedCells?.size || 0;
  };
  
  // Function to get the color of locked squares
  const getLockedSquaresColor = (): TileColor | null => {
    // If no locked cells, return null
    if (!puzzle?.lockedCells?.size) return null;
    
    // Get the first locked cell coordinates
    const firstLockedCell = Array.from(puzzle.lockedCells)[0];
    if (!firstLockedCell) return null;
    
    // Convert 'row,col' string to row and col numbers
    const [row, col] = firstLockedCell.split(',').map(Number);
    
    // Return the color of that locked cell from the grid
    return puzzle.grid[row][col];
  };
  
  // Function to get CSS color for the locked count
  const getLockedColorCSS = () => {
    const lockedColor = getLockedSquaresColor();
    // Use the color of locked squares, or white if not available
    return lockedColor !== null ? getColorCSS(lockedColor) : '#ffffff';
  };

  // Custom function to get adjusted colors based on color blindness setting
  const getAdjustedColorCSS = (color: TileColor): string => {
    // For custom color scheme
    if (settings.customColorScheme[color]) {
      return settings.customColorScheme[color] as string;
    }
    
    // For color blind modes
    if (settings.colorBlindMode !== ColorBlindMode.None) {
      const colorBlindPresets: Record<ColorBlindMode, Record<TileColor, string>> = {
        [ColorBlindMode.Protanopia]: {
          [TileColor.Red]: '#a0a0a0', // Gray instead of red
          [TileColor.Green]: '#f5f5a0', // Yellow-ish instead of green
          [TileColor.Blue]: '#5555ff', // Keep blue
          [TileColor.Yellow]: '#ffff55', // Keep yellow
          [TileColor.Purple]: '#a0a0ff', // Light blue instead of purple
          [TileColor.Orange]: '#f5f5a0', // Yellow-ish instead of orange
        },
        [ColorBlindMode.Deuteranopia]: {
          [TileColor.Red]: '#ff5555', // Keep red
          [TileColor.Green]: '#a0a0a0', // Gray instead of green
          [TileColor.Blue]: '#5555ff', // Keep blue
          [TileColor.Yellow]: '#ffff55', // Keep yellow
          [TileColor.Purple]: '#ff55ff', // Keep purple
          [TileColor.Orange]: '#ff5555', // Red-ish instead of orange
        },
        [ColorBlindMode.Tritanopia]: {
          [TileColor.Red]: '#ff5555', // Keep red
          [TileColor.Green]: '#55ff55', // Keep green
          [TileColor.Blue]: '#a0a0a0', // Gray instead of blue
          [TileColor.Yellow]: '#ff5555', // Red-ish instead of yellow
          [TileColor.Purple]: '#ff55ff', // Keep purple
          [TileColor.Orange]: '#ff9955', // Keep orange
        },
        [ColorBlindMode.None]: {} as Record<TileColor, string> // This is a placeholder
      };
      
      if (colorBlindPresets[settings.colorBlindMode][color]) {
        return colorBlindPresets[settings.colorBlindMode][color];
      }
    }
    
    // Use default colors enhanced for high contrast mode if enabled
    const baseColorMap = {
      [TileColor.Red]: settings.highContrastMode ? '#ff3333' : '#ff5555',
      [TileColor.Green]: settings.highContrastMode ? '#33ff33' : '#55ff55',
      [TileColor.Blue]: settings.highContrastMode ? '#3333ff' : '#5555ff',
      [TileColor.Yellow]: settings.highContrastMode ? '#ffff33' : '#ffff55',
      [TileColor.Purple]: settings.highContrastMode ? '#ff33ff' : '#ff55ff',
      [TileColor.Orange]: settings.highContrastMode ? '#ff9933' : '#ff9955',
    };
    
    return baseColorMap[color] || '#ffffff';
  };

  // Override the original getColorCSS function to use our new adjusted version
  const getColorCSS = (color: TileColor): string => {
    return getAdjustedColorCSS(color);
  };

  // Function to handle settings change
  const handleSettingsChange = (newSettings: AppSettings) => {
    console.log("Applying new settings:", newSettings);
    setSettings(prevSettings => {
      // First check if any settings actually changed to avoid unnecessary rerenders
      const hasChanges = Object.keys(newSettings).some(key => {
        const k = key as keyof AppSettings;
        // Deep compare for objects like customColorScheme
        if (k === 'customColorScheme') {
          return JSON.stringify(newSettings[k]) !== JSON.stringify(prevSettings[k]);
        }
        return newSettings[k] !== prevSettings[k];
      });
      
      if (hasChanges) {
        // Only update if there are actual changes
        const updatedSettings = {...newSettings};
        // Save to localStorage immediately
        localStorage.setItem('colorLockSettings', JSON.stringify(updatedSettings));
        return updatedSettings;
      }
      return prevSettings;
    });
  };

  // Define this function inside the component
  function getCurrentMoveCount() {
    // Simply return the current moves from the puzzle state
    return puzzle ? puzzle.userMovesUsed : 0;
  }

  // Helper function to convert TileColor to emoji
  function tileColorToEmoji(color: TileColor): string {
    const colorEmojis = {
      [TileColor.Red]: "🟥",
      [TileColor.Green]: "🟩",
      [TileColor.Blue]: "🟦",
      [TileColor.Yellow]: "🟨",
      [TileColor.Purple]: "🟪",
      [TileColor.Orange]: "🟧",
    };
    
    return colorEmojis[color] || "⬜";
  }

  // Function to generate share text with emojis
  const generateShareText = (): string => {
    if (!puzzle) return "";
    
    // Get current date
    const now = new Date();
    const dateStr = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    
    // Create header text
    let shareText = `Color Lock - ${dateStr}\n`;
    shareText += `Target: ${tileColorToEmoji(puzzle.targetColor)}\n\n`;
    shareText += `Score: ${puzzle.userMovesUsed} moves`;
    
    // Add medal emoji if move count meets or beats the goal
    if (puzzle.userMovesUsed <= puzzle.algoScore) {
      shareText += " 🏅";
    }
    
    shareText += "\n\n";
    shareText += "Today's Board:\n";
    
    // Add the starting grid
    for (let r = 0; r < puzzle.startingGrid.length; r++) {
      const row = puzzle.startingGrid[r];
      const rowEmojis = row.map(color => tileColorToEmoji(color)).join("");
      shareText += rowEmojis + "\n";
    }
    
    return shareText;
  };
  
  // Function to handle generic share action
  const handleShare = async () => {
    const shareText = generateShareText();
    
    // Try to use the Web Share API if available
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Color Lock Results',
          text: shareText,
        });
        console.log('Successfully shared');
      } catch (error) {
        console.error('Error sharing:', error);
        // Fall back to clipboard if sharing fails
        copyToClipboard(shareText, 'Result copied to clipboard!');
      }
    } else {
      // Fallback to clipboard for browsers that don't support Web Share API
      copyToClipboard(shareText, 'Result copied to clipboard!');
    }
  };
  
  // Function to share to Twitter
  const shareToTwitter = () => {
    const shareText = generateShareText();
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
  };
  
  // Function to share to Facebook
  const shareToFacebook = () => {
    const shareText = generateShareText();
    // Facebook sharing requires a URL, so we'll share the game URL and use the text as the quote
    const baseUrl = window.location.href.split('?')[0]; // Remove any query parameters
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(baseUrl)}&quote=${encodeURIComponent(shareText)}`;
    window.open(facebookUrl, '_blank', 'noopener,noreferrer');
  };
  
  // Helper function to copy to clipboard with visual feedback
  const copyToClipboard = (text: string, message: string = 'Copied to clipboard!') => {
    // Create a tooltip element for feedback
    const tooltip = document.createElement('div');
    tooltip.className = 'copy-tooltip';
    
    navigator.clipboard.writeText(text)
      .then(() => {
        // Success message
        tooltip.textContent = message;
        tooltip.classList.add('success');
      })
      .catch((err) => {
        // Error message
        console.error('Failed to copy: ', err);
        tooltip.textContent = 'Failed to copy';
        tooltip.classList.add('error');
      })
      .finally(() => {
        // Display tooltip
        document.body.appendChild(tooltip);
        
        // Remove tooltip after 2 seconds
        setTimeout(() => {
          tooltip.classList.add('fade-out');
          setTimeout(() => {
            document.body.removeChild(tooltip);
          }, 300);
        }, 2000);
      });
  };

  // Share statistics
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
    
    copyToClipboard(shareText, 'Stats copied to clipboard!');
  };

  // Determine additional container classes based on settings
  const containerClasses = ['container'];
  if (settings.highContrastMode) {
    containerClasses.push('high-contrast-mode');
  }
  if (!settings.enableAnimations) {
    containerClasses.push('no-animations');
  }

  // Sound settings
  const soundEnabled = settings?.enableSoundEffects || false;

  return (
    <div className={containerClasses.join(' ')}>
      {/* Settings Button */}
      <button className="settings-button" onClick={() => setShowSettings(true)} aria-label="Settings">
        <FontAwesomeIcon icon={faGear} />
      </button>

      {/* Stats Button */}
      <button className="stats-button" onClick={() => setShowStats(true)} aria-label="Statistics">
        <FontAwesomeIcon icon={faTrophy} />
      </button>

      {/* Top info card */}
      <div className="top-card">
        <h1>Color Lock</h1>
        <div className="target-row">
          <span>Target:</span>
          <div className="target-circle" style={{ backgroundColor: getColorCSS(puzzle.targetColor) }} />
        </div>
        <div className="goal-row">
          <span>Goal: {dailyGoal}</span>
          <span>Moves: {puzzle.userMovesUsed}</span>
        </div>
        <button className="hint-button" onClick={handleHint}>Get Hint</button>
      </div>

      {/* Grid */}
      <div className="grid">
        {puzzle.grid.map((row, rIdx) => (
          <div key={rIdx} className="grid-row">
            {row.map((color, cIdx) => {
              const key = `${rIdx},${cIdx}`;
              const isLocked = puzzle.lockedCells.has(key);
              const isHinted = hintCell && hintCell.row === rIdx && hintCell.col === cIdx;
              const isPartOfLargestRegion = isLocked && settings.highlightLargestRegion;
              
              // For hinted cells, set the background color explicitly and add animations
              const cellStyle = {
                backgroundColor: getColorCSS(color), // Always set the base color explicitly
                ...(isHinted && settings.enableAnimations && {
                  border: '2px solid #1e90ff', // Persistent blue border
                  boxShadow: '0 0 6px 1px rgba(30, 144, 255, 0.6)', // Persistent blue glow
                  '--current-color': getColorCSS(color),
                  '--target-color': getColorCSS(hintCell.newColor),
                })
              };
              
              // Determine additional cell classes
              const cellClasses = ['grid-cell'];
              if (isHinted && settings.enableAnimations) cellClasses.push('hint-cell');
              if (isPartOfLargestRegion) cellClasses.push('highlight-largest-region');
              
              return (
                <div key={key} className="grid-cell-container">
                  <div
                    className={cellClasses.join(' ')}
                    style={cellStyle}
                    onClick={() => handleTileClick(rIdx, cIdx)}
                  >
                    {isLocked && (
                      <MinimalWhiteLock />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* If lost, show a message */}
      {puzzle.isLost && (
        <div className="status-message lost">
          You locked the wrong color. Target was {puzzle.targetColor}.
        </div>
      )}

      {/* Controls section with locked region indicator and centered Try Again button */}
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
          
          {/* Try Again button */}
          <button 
            className="try-again-button" 
            onClick={handleTryAgain}
          >
            Try Again
          </button>
        </div>
      </div>

      {/* Color Picker Modal */}
      {showColorPicker && (
        <ColorPickerModal onSelect={handleColorSelect} onCancel={closeColorPicker} getColorCSS={getColorCSS} />
      )}

      {/* Win Modal */}
      {showWinModal && (
        <WinModal 
          puzzle={puzzle} 
          onTryAgain={handleTryAgain} 
          onClose={() => setShowWinModal(false)}
          getColorCSS={getColorCSS}
          shareToTwitter={shareToTwitter}
          shareToFacebook={shareToFacebook}
          copyToClipboard={(text) => copyToClipboard(text, 'Result copied to clipboard!')}
          generateShareText={generateShareText}
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
    </div>
  );
};

// -------------------------------------------------------------------------
// 5. Color Picker Modal Component
// -------------------------------------------------------------------------
interface ColorPickerModalProps {
  onSelect: (color: TileColor) => void;
  onCancel: () => void;
  getColorCSS: (color: TileColor) => string;
}

const ColorPickerModal: React.FC<ColorPickerModalProps> = ({ onSelect, onCancel, getColorCSS }) => {
  return (
    <div className="color-picker-modal-backdrop" onClick={onCancel}>
      <div className="color-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="color-bubbles">
          {allColors.map((color) => (
            <div key={color} className="color-bubble-container">
              <button
                className="color-bubble"
                style={{ backgroundColor: getColorCSS(color) }}
                onClick={() => onSelect(color)}
                aria-label={`Select ${color} color`}
              />
              <div className="color-label">{color}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------------------
// 6. Win Modal Component
// -------------------------------------------------------------------------
interface WinModalProps {
  puzzle: DailyPuzzle;
  onTryAgain: () => void;
  onClose: () => void;
  getColorCSS: (color: TileColor) => string;
  shareToTwitter: () => void;
  shareToFacebook: () => void;
  copyToClipboard: (text: string) => void;
  generateShareText: () => string;
  setShowWinModal: (show: boolean) => void;
}

const WinModal: React.FC<WinModalProps> = ({ 
  puzzle, 
  onTryAgain, 
  onClose, 
  getColorCSS, 
  shareToTwitter, 
  shareToFacebook, 
  copyToClipboard, 
  generateShareText,
  setShowWinModal
}) => {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [windowDimensions, setWindowDimensions] = useState<{width: number, height: number}>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [confettiActive, setConfettiActive] = useState<boolean>(true);
  const [showShareButtons, setShowShareButtons] = useState<boolean>(false);

  // Get settings for sound playback
  const settings = useContext(SettingsContext);
  const soundEnabled = settings?.soundEnabled || false;
  
  // Play celebration sound once
  useEffect(() => {
    if (soundEnabled) {
      const audio = new Audio('/sounds/win-celebration.mp3');
      audio.volume = 0.5;
      audio.play().catch(err => console.warn('Could not play sound:', err));
    }
    
    // Setup window resize listener for confetti
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    
    // Stop confetti after some time
    const timer = setTimeout(() => {
      setConfettiActive(false);
    }, 5000);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [soundEnabled]);

  // Timer countdown effect
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      const secs = Math.floor(diff / 1000);
      const hrs = Math.floor(secs / 3600);
      const mins = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setTimeLeft(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      if (secs <= 0) {
        onTryAgain();
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [onTryAgain]);

  // Get color name for display
  const colorName = tileColorToName(puzzle.targetColor);

  // Calculate if the user beat the optimal solution
  const beatOptimal = puzzle.userMovesUsed <= puzzle.algoScore;
  
  // Generate share text
  const shareText = generateShareText();

  // Handle share button click
  const handleShareClick = () => {
    setShowShareButtons(!showShareButtons);
  };

  return (
    <div className="modal-backdrop">
      {confettiActive && (
        <ReactConfetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          recycle={true}
          numberOfPieces={250}
          colors={['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']}
        />
      )}
      
      <div className="win-modal win-modal-animated">
        <h2 className="congratulations-title">Congratulations!</h2>
        
        <div className="unlocked-message">
          Unlocked <span className="color-name" style={{color: getColorCSS(puzzle.targetColor)}}>{colorName}</span> in <strong>{puzzle.userMovesUsed}</strong> moves!
          {beatOptimal && <span className="optimal-badge">🏅</span>}
        </div>
        
        <div className="win-stats">
          <div className="stat-item">
            <div className="stat-value">{puzzle.algoScore}</div>
            <div className="stat-label">Optimal Moves</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{puzzle.timesPlayed}</div>
            <div className="stat-label">Times Played</div>
          </div>
        </div>
        
        <div className="next-puzzle-timer">
          <p>New Puzzle in:</p>
          <div className="timer">
            {timeLeft.split(':').map((unit, index) => (
              <React.Fragment key={index}>
                {index > 0 && <span className="time-separator">:</span>}
                <span className="time-unit">{unit}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
        
        <div className="share-section">
          <button className="share-button" onClick={handleShareClick}>
            Share
          </button>
          
          {showShareButtons && (
            <div className="share-options">
              <span className="share-on">Share on:</span>
              <div className="social-buttons">
                <button className="social-button twitter-button" onClick={shareToTwitter}>
                  <svg viewBox="0 0 24 24" width="24" height="24">
                    <path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z" fill="#1DA1F2" />
                  </svg>
                </button>
                <button className="social-button facebook-button" onClick={shareToFacebook}>
                  <svg viewBox="0 0 24 24" width="24" height="24">
                    <path d="M20 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8.61v-6.97h-2.34V11.3h2.34v-2c0-2.33 1.42-3.6 3.5-3.6 1 0 1.84.07 2.1.1v2.43h-1.44c-1.13 0-1.35.54-1.35 1.33v1.74h2.7l-.35 2.73h-2.35V21H20a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z" fill="#4267B2" />
                  </svg>
                </button>
                <button className="social-button clipboard-button" onClick={() => copyToClipboard(shareText)}>
                  <svg viewBox="0 0 24 24" width="24" height="24">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="#333" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-buttons">
          <button className="try-again-modal-button" onClick={() => {
            onTryAgain();
            setShowWinModal(false);
          }}>Try Again</button>
          <button className="close-button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

// Add this component to your file
const MinimalWhiteLock = () => (
  <svg 
    width="14" 
    height="14" 
    viewBox="0 0 14 14" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className="lock-icon"
  >
    {/* Thinner shackle */}
    <path 
      d="M5 7V5.5C5 4.6 6.3 4 7 4C7.7 4 9 4.6 9 5.5V7" 
      stroke="white" 
      strokeWidth="1.2" 
      strokeLinecap="round"
    />
    
    {/* Thinner lock body */}
    <rect x="4" y="7" width="6" height="5" fill="white" rx="0.8" />
  </svg>
);

// Helper function to convert TileColor to color name
function tileColorToName(color: TileColor): string {
  const colorNames = {
    [TileColor.Red]: "Red",
    [TileColor.Green]: "Green",
    [TileColor.Blue]: "Blue",
    [TileColor.Yellow]: "Yellow",
    [TileColor.Purple]: "Purple",
    [TileColor.Orange]: "Orange",
  };
  
  return colorNames[color] || "Color";
}

export default App;