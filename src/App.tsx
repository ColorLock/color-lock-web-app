import React, { useState, useEffect } from 'react';
import './App.css';

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

/**
 * Generate a puzzle for a given date and grid size.
 * This uses only the date (e.g. "2025-03-06") to create a stable seed so that
 * the puzzle remains the same for the entire day.
 */
function generatePuzzleForDate(dateStr: string, gridSize: number): DailyPuzzle {
  // Match Swift's stableSeed(for:) exactly
  const seedVal = stableSeedForDate(dateStr);
  console.log(`Using seed ${seedVal} (based solely on the date)`);
  
  // Create a seeded generator that matches Swift's implementation
  const rng = createSwiftSeededGenerator(seedVal);
  
  // Match Swift's makeRandomGrid function exactly
  const grid: TileColor[][] = [];
  for (let r = 0; r < gridSize; r++) {
    const row: TileColor[] = [];
    for (let c = 0; c < gridSize; c++) {
      // Must match Swift's Int.random(in: 0..<allColors.count, using: &rng) behavior
      const colorIndex = rng.nextIntInRange(allColors.length);
      row.push(allColors[colorIndex]);
    }
    grid.push(row);
  }
  
  // Match Swift's target color selection
  const targetIndex = rng.nextIntInRange(allColors.length);
  const target = allColors[targetIndex];
  
  // Log the exact sequence of random numbers generated
  console.log("Generated random indices:", rng.getGeneratedNumbers());
  
  // Use the same algorithm for finding the largest region
  const locked = findLargestRegion(grid);
  
  console.log("Web: Generated grid for", dateStr, ":", grid);
  console.log("Web: Target color:", target);
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
    targetColor: target,
    startingGrid: grid.map(row => [...row]),
    bestScoreUsed: null,
    timesPlayed: 0,
    totalMovesForThisBoard: 0
  };
}

function generatePuzzleForToday(gridSize: number): DailyPuzzle {
  const key = dateKeyForToday();
  const existing = loadDailyPuzzleIfExists(key);
  if (existing) {
    console.log(`Loaded puzzle for ${key}`);
    return existing;
  }
  const puzzle = generatePuzzleForDate(key, gridSize);
  saveDailyPuzzle(puzzle);
  return puzzle;
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

  // Generate the puzzle for the fixed date on first render.
  useEffect(() => {
    const newPuzzle = generatePuzzleForToday(GRID_SIZE);
    setPuzzle(newPuzzle);
  }, []);

  if (!puzzle) {
    return <div className="loading">Loading puzzle...</div>;
  }

  // Get the daily goal if available
  const dailyGoal = dailyGoalData[puzzle.dateString] ?? 999;

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
  const handleTryAgain = () => {
    const newPuzzle = generatePuzzleForDate(DATE_TO_USE, GRID_SIZE);
    setPuzzle(newPuzzle);
    setShowWinModal(false);
  };

  const closeWinModal = () => {
    setShowWinModal(false);
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
      </div>

      {/* Grid */}
      <div className="grid">
        {puzzle.grid.map((row, rIdx) => (
          <div key={rIdx} className="grid-row">
            {row.map((color, cIdx) => {
              const key = `${rIdx},${cIdx}`;
              const isLocked = puzzle.lockedCells.has(key);
              return (
                <div key={key} className="grid-cell-container">
                  <div
                    className="grid-cell"
                    style={{ backgroundColor: color }}
                    onClick={() => handleTileClick(rIdx, cIdx)}
                  />
                  {isLocked && (
                    <div className="locked-overlay">
                      <span className="lock-icon" />
                    </div>
                  )}
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