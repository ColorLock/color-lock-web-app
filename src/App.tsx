import { fetchPuzzleFromFirestore } from './firebase_client';
import React, { useState, useEffect } from 'react';
import './App.css';
import { getHint, HintResult } from './hints';


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

  // When a new color is selected, perform flood fill and update the puzzle.
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
      setShowWinModal(true);
    }
  };

  const closeColorPicker = () => {
    setShowColorPicker(false);
    setSelectedTile(null);
  };

  // "Try Again" resets the puzzle using the same date-based seed.
  const handleTryAgain = async () => {
    try {
      const firestoreData = await fetchPuzzleFromFirestore(DATE_TO_USE);
      const newPuzzle = generatePuzzleFromDB(firestoreData, DATE_TO_USE);
      setPuzzle(newPuzzle);
    } catch (error) {
      console.error("Error in try again:", error);
      // Don't leave the app hanging if there's an error
      setError("Couldn't load new puzzle. Please refresh the page.");
    } finally {
      setShowWinModal(false);
    }
  };

  const closeWinModal = () => {
    setShowWinModal(false);
  };

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

    // Get hint for the current move number
    const hint = getHint(firestoreData, puzzle.userMovesUsed);
    
    if (hint && hint.valid) {
      console.log("Hint provided:", hint);
      setHintCell(hint);
    } else {
      console.log("No valid hint available");
    }
  };

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
              
              // For hinted cells, use custom CSS variables
              const cellStyle = isHinted ? {
                '--current-color': color,
                '--target-color': hintCell.newColor,
                animation: 'color-fade 3.5s infinite ease-in-out'
              } : {
                backgroundColor: color
              };
              
              return (
                <div key={key} className="grid-cell-container">
                  <div
                    className={`grid-cell ${isHinted ? 'hint-cell' : ''}`}
                    style={cellStyle}
                    onClick={() => handleTileClick(rIdx, cIdx)}
                  >
                    {isLocked && <div className="lock-overlay"><span>🔒</span></div>}
                    
                    {/* Separate element for the blue border */}
                    {isHinted && (
                      <div className="blue-outline"></div>
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

      {/* Try Again button */}
      <button className="try-again-button" onClick={handleTryAgain}>
        Try Again
      </button>

      {/* Color Picker Modal */}
      {showColorPicker && (
        <ColorPickerModal onSelect={handleColorSelect} onCancel={closeColorPicker} />
      )}

      {/* Win Modal */}
      {showWinModal && puzzle.isSolved && (
        <WinModal puzzle={puzzle} onTryAgain={handleTryAgain} onClose={closeWinModal} />
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

export default App;