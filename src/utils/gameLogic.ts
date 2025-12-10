import { TileColor, FirestorePuzzleData, DailyPuzzle, PuzzleGrid } from '../types';
import { createSwiftSeededGenerator, stableSeedForDate } from './dateUtils';
import { AppSettings, DifficultyLevel } from '../types/settings';
import { applyActionToGrid } from './gameUtils';
import { getLossThresholdForDifficulty } from './puzzleUtils';

/**
 * Flood fill algorithm for finding connected regions of the same color
 */
export function floodFill(
  grid: TileColor[][],
  row: number,
  col: number,
  oldColor: TileColor
): [number[], number[]] {
  const rows = grid.length;
  const cols = grid[0].length;
  const rowIndices: number[] = [];
  const colIndices: number[] = [];
  
  if (grid[row][col] !== oldColor) {
    return [rowIndices, colIndices];
  }
  
  const queue: [number, number][] = [[row, col]];
  const visited = new Set<string>();
  visited.add(`${row},${col}`);
  
  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    rowIndices.push(r);
    colIndices.push(c);
    
    // Check all 4 directions
    const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    for (const [dr, dc] of directions) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;
      
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && 
          grid[nr][nc] === oldColor && !visited.has(key)) {
        queue.push([nr, nc]);
        visited.add(key);
      }
    }
  }
  
  return [rowIndices, colIndices];
}

/**
 * Find the largest contiguous region of the same color in the grid
 */
export function findLargestRegion(grid: TileColor[][]): Set<string> {
  const rows = grid.length;
  const cols = grid[0].length;
  const visited = new Set<string>();
  let largestRegion = new Set<string>();
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (!visited.has(key)) {
        const color = grid[r][c];
        const [rowIndices, colIndices] = floodFill(grid, r, c, color);
        
        // Add all cells to visited
        for (let i = 0; i < rowIndices.length; i++) {
          visited.add(`${rowIndices[i]},${colIndices[i]}`);
        }
        
        // Check if this region is larger than the current largest
        const currentRegion = new Set<string>();
        for (let i = 0; i < rowIndices.length; i++) {
          currentRegion.add(`${rowIndices[i]},${colIndices[i]}`);
        }
        
        if (currentRegion.size > largestRegion.size) {
          largestRegion = currentRegion;
        }
      }
    }
  }
  
  return largestRegion;
}

/**
 * Check if the entire board is a single color
 */
export function isBoardUnified(grid: TileColor[][]): boolean {
  if (grid.length === 0 || grid[0].length === 0) return true; // Empty grid is unified?
  const firstColor = grid[0][0];
  return grid.every(row => row.every(cell => cell === firstColor));
}

/**
 * Generate a puzzle from the firestore data, adjusting the starting state based on difficulty.
 */
export function generatePuzzleFromDB(
  firestoreData: FirestorePuzzleData,
  dateStr: string,
  settings: AppSettings, // Now required to determine difficulty
  options?: { skipDifficultyAdjustments?: boolean }
): DailyPuzzle {
  const skipDifficultyAdjustments = options?.skipDifficultyAdjustments ?? false;
  // Create a specific RNG instance for today's date (might not be needed anymore)
  // const rng = createSwiftSeededGenerator(stableSeedForDate(dateStr));

  // Get the TRUE initial state from Firestore
  const trueInitialGrid = convertFirestoreGridToArray(firestoreData.states[0]);

  // Create deep copies for manipulation and storage
  const startingGridForReference = trueInitialGrid.map(row => [...row]);
  let currentGridState = trueInitialGrid.map(row => [...row]);
  let effectiveStartingMoveIndex = 0;

  const actions = firestoreData.actions || [];

  console.log(`Generating puzzle for difficulty: ${settings.difficultyLevel}`);

  // Apply initial moves based on difficulty when using a single shared puzzle source
  if (!skipDifficultyAdjustments) {
    switch (settings.difficultyLevel) {
      case DifficultyLevel.Medium:
        if (actions.length >= 1) {
          console.log("Applying 1 action for Medium difficulty...");
          currentGridState = applyActionToGrid(currentGridState, actions[0], firestoreData);
          effectiveStartingMoveIndex = 1;
        } else {
          console.warn("Not enough actions in Firestore data for Medium difficulty, starting from Hard.");
        }
        break;
      case DifficultyLevel.Easy:
        if (actions.length >= 3) {
          console.log("Applying 3 actions for Easy difficulty...");
          currentGridState = applyActionToGrid(currentGridState, actions[0], firestoreData);
          currentGridState = applyActionToGrid(currentGridState, actions[1], firestoreData);
          currentGridState = applyActionToGrid(currentGridState, actions[2], firestoreData);
          effectiveStartingMoveIndex = 3;
        } else {
           console.warn(`Not enough actions (${actions.length}) in Firestore data for Easy difficulty, applying fewer moves.`);
           // Apply as many moves as possible up to 3
           for(let i = 0; i < Math.min(actions.length, 3); i++) {
               currentGridState = applyActionToGrid(currentGridState, actions[i], firestoreData);
           }
           effectiveStartingMoveIndex = Math.min(actions.length, 3);
        }
        break;
      case DifficultyLevel.Hard:
      default:
        // No actions applied for Hard difficulty
        console.log("Using original initial state for Hard difficulty.");
        effectiveStartingMoveIndex = 0;
        break;
    }
  }

  // Find the initial locked region based on the *difficulty-adjusted* starting grid
  const initialLockedCells = findLargestRegion(currentGridState);

  // The algoScore remains the score required from the TRUE initial state
  const algoScore = firestoreData.algoScore;

  return {
    dateString: dateStr,
    grid: currentGridState, // The grid the user starts playing with
    startingGrid: startingGridForReference, // The TRUE initial grid from DB
    userMovesUsed: 0, // User starts with 0 moves regardless of difficulty
    isSolved: false,
    isLost: false,
    lockedCells: initialLockedCells, // Locked cells based on the starting grid for this difficulty
    targetColor: firestoreData.targetColor,
    bestScoreUsed: null,
    timesPlayed: 0,
    totalMovesForThisBoard: 0,
    algoScore: algoScore, // Use the original algoScore
    effectiveStartingMoveIndex: effectiveStartingMoveIndex, // Store the starting index
    lossThreshold: getLossThresholdForDifficulty(settings.difficultyLevel),
  };
}

/**
 * Convert Firestore grid data to a 2D array
 */
export function convertFirestoreGridToArray(gridData: PuzzleGrid): TileColor[][] {
  const size = Object.keys(gridData).length;
  const result: TileColor[][] = [];
  
  for (let i = 0; i < size; i++) {
    result.push(gridData[i.toString()]);
  }
  
  return result;
} 
