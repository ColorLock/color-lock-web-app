import { fetchPuzzleFromFirestore } from './firebase_client';
import React, { useState, useEffect } from 'react';
import './App.css';
import { getHint, HintResult, getValidActions, computeActionDifference, NUM_COLORS } from './hints';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock } from '@fortawesome/free-solid-svg-icons';


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
  const [nextPuzzleTime, setNextPuzzleTime] = useState({ hours: 23, minutes: 18, seconds: 52 });

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

  // Reset isOnOptimalPath when trying again
  const handleTryAgain = async () => {
    try {
      // Clear any active hints
      setHintCell(null);
      
      const firestoreData = await fetchPuzzleFromFirestore(DATE_TO_USE);
      const newPuzzle = generatePuzzleFromDB(firestoreData, DATE_TO_USE);
      setPuzzle(newPuzzle);
      setIsOnOptimalPath(true); // Reset path tracking
    } catch (error) {
      console.error("Error in try again:", error);
      // Don't leave the app hanging if there's an error
      setError("Couldn't load new puzzle. Please refresh the page.");
    } finally {
      setShowWinModal(false);
    }
  };

  const handlePuzzleSolved = () => {
    setShowWinModal(true);
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

  // Add this function to convert TileColor to CSS color string
  const getColorCSS = (color: TileColor): string => {
    // Map TileColor enum values to CSS colors
    const colorMap = {
      [TileColor.Red]: '#ff5555',
      [TileColor.Green]: '#55ff55',
      [TileColor.Blue]: '#5555ff',
      [TileColor.Yellow]: '#ffff55',
      [TileColor.Purple]: '#ff55ff',
      [TileColor.Orange]: '#ff9955',
      // Add any other colors your game uses
    };
    
    return colorMap[color] || '#ffffff'; // Default to white if color not found
  };

  // Define this function inside the component
  function getCurrentMoveCount() {
    // Simply return the current moves from the puzzle state
    return puzzle ? puzzle.userMovesUsed : 0;
  }

  return (
    <div className="container">
      {/* Top info card */}
      <div className="top-card">
        <h1>Color Lock</h1>
        <div className="target-row">
          <span>Target:</span>
          <div className="target-circle" style={{ backgroundColor: puzzle.targetColor }} />
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
              
              // For hinted cells, set the background color explicitly and add animations
              const cellStyle = {
                backgroundColor: color, // Always set the base color explicitly
                ...(isHinted && {
                  border: '2px solid #1e90ff', // Persistent blue border
                  boxShadow: '0 0 6px 1px rgba(30, 144, 255, 0.6)', // Persistent blue glow
                  '--current-color': color,
                  '--target-color': hintCell.newColor,
                })
              };
              
              return (
                <div key={key} className="grid-cell-container">
                  <div
                    className={`grid-cell ${isHinted ? 'hint-cell' : ''}`}
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
        <ColorPickerModal onSelect={handleColorSelect} onCancel={closeColorPicker} />
      )}

      {/* Win Modal */}
      {showWinModal && (
        <div className="modal-overlay">
          <div className="win-modal">
            <h1 className="congratulations-title">Congratulations!</h1>
            
            <p className="unlocked-message">
              Unlocked {tileColorToName(puzzle.targetColor)} in {getCurrentMoveCount()} moves!
            </p>
            
            <div className="next-puzzle-timer">
              <p>New Puzzle in:</p>
              <div className="timer">
                <span className="time-value">{nextPuzzleTime.hours}</span>
                <span className="time-separator">:</span>
                <span className="time-value">{nextPuzzleTime.minutes.toString().padStart(2, '0')}</span>
                <span className="time-separator">:</span>
                <span className="time-value">{nextPuzzleTime.seconds.toString().padStart(2, '0')}</span>
              </div>
            </div>
            
            <div className="modal-buttons">
              <button className="share-button">Share</button>
              <button 
                className="try-again-modal-button"
                onClick={() => {
                  handleTryAgain();
                  setShowWinModal(false);
                }}
              >
                Try Again
              </button>
            </div>
            
            <button 
              className="close-button"
              onClick={() => setShowWinModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------------------
// 5. Color Picker Modal Component
// -------------------------------------------------------------------------
interface ColorPickerModalProps {
  onSelect: (color: TileColor) => void;
  onCancel: () => void;
}

const ColorPickerModal: React.FC<ColorPickerModalProps> = ({ onSelect, onCancel }) => {
  return (
    <div className="color-picker-modal-backdrop">
      <div className="color-picker-modal">
        <h3>Pick a Color</h3>
        <div className="color-bubbles">
          {allColors.map((color) => (
            <div key={color} className="color-bubble-container">
              <button
                className="color-bubble"
                style={{ backgroundColor: color }}
                onClick={() => onSelect(color)}
              />
              <div className="color-label">{color}</div>
            </div>
          ))}
        </div>
        <button className="cancel-button" onClick={onCancel}>
          Cancel
        </button>
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
}

const WinModal: React.FC<WinModalProps> = ({ puzzle, onTryAgain, onClose }) => {
  const [timeLeft, setTimeLeft] = useState<string>("");

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

  return (
    <div className="modal-backdrop">
      <div className="win-modal">
        <h2>Congratulations!</h2>
        <p>
          You unlocked {puzzle.targetColor} in {puzzle.userMovesUsed} moves!
        </p>
        <p>New Puzzle in: {timeLeft}</p>
        <div className="modal-buttons">
          <button onClick={onTryAgain}>Try Again</button>
          <button onClick={onClose}>Close</button>
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