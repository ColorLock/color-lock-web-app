import { TileColor, FirestorePuzzleData, DailyPuzzle, PuzzleGrid } from '../types';
import { createSwiftSeededGenerator, stableSeedForDate } from './dateUtils';

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
  const firstColor = grid[0][0];
  return grid.every(row => row.every(cell => cell === firstColor));
}

/**
 * Generate a puzzle from the firestore data
 */
export function generatePuzzleFromDB(firestoreData: FirestorePuzzleData, dateStr: string): DailyPuzzle {
  // Create a specific RNG instance for today's date
  const rng = createSwiftSeededGenerator(stableSeedForDate(dateStr));
  
  // Get the initial state
  const initialState = convertFirestoreGridToArray(firestoreData.states[0]);
  
  // Create a deep copy of the initial grid for the starting grid
  const startingGrid = initialState.map(row => [...row]);
  
  return {
    dateString: dateStr,
    grid: initialState,
    startingGrid: startingGrid,
    userMovesUsed: 0,
    isSolved: false,
    isLost: false,
    lockedCells: new Set(),
    targetColor: firestoreData.targetColor,
    bestScoreUsed: null,
    timesPlayed: 0,
    totalMovesForThisBoard: 0,
    algoScore: firestoreData.algoScore
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