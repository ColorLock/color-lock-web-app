import { DailyPuzzle, TileColor } from '../types';
import { findLargestRegion } from './gameLogic';

/**
 * Checks if the puzzle meets the conditions for autocomplete:
 * 1. The locked region is the target color
 * 2. The locked region size is greater than or equal to (boardSize - 3) tiles
 */
export const shouldShowAutocomplete = (puzzle: DailyPuzzle): boolean => {
  if (!puzzle || puzzle.isSolved || puzzle.isLost) {
    return false;
  }

  // Calculate the total board size
  const boardSize = puzzle.grid.length * puzzle.grid[0].length;

  // Get the size of the locked region
  const lockedRegionSize = puzzle.lockedCells.size;

  // First check: locked region size is at least (boardSize - 3)
  if (lockedRegionSize < boardSize - 3) {
    return false;
  }

  // Second check: locked region is the target color
  // Get the first cell of the locked region to check its color
  if (lockedRegionSize > 0) {
    const firstCell = puzzle.lockedCells.values().next().value as string;
    const [row, col] = firstCell.split(',').map(Number);
    const lockedColor = puzzle.grid[row][col];

    // Check if the locked color is the target color
    return lockedColor === puzzle.targetColor;
  }

  return false;
};

/**
 * Find all connected regions of the same color in the grid
 * Returns a Set of Sets, where each inner Set contains the cell keys for a connected region
 */
const findAllRegions = (grid: TileColor[][], lockedCells: Set<string>): Set<Set<string>> => {
  const regions = new Set<Set<string>>();
  const visited = new Set<string>();
  
  // Helper function to find a connected region of the same color
  const findRegion = (row: number, col: number, color: TileColor): Set<string> => {
    const region = new Set<string>();
    const queue: [number, number][] = [[row, col]];
    
    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      const cellKey = `${r},${c}`;
      
      // Skip if this cell has been visited or is locked
      if (visited.has(cellKey) || lockedCells.has(cellKey)) continue;
      
      // Skip if this cell doesn't match the color we're looking for
      if (grid[r][c] !== color) continue;
      
      // Mark as visited and add to region
      visited.add(cellKey);
      region.add(cellKey);
      
      // Check adjacent cells (up, right, down, left)
      const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];
      for (const [dr, dc] of directions) {
        const newRow = r + dr;
        const newCol = c + dc;
        
        // Skip if out of bounds
        if (newRow < 0 || newRow >= grid.length || newCol < 0 || newCol >= grid[0].length) continue;
        
        queue.push([newRow, newCol]);
      }
    }
    
    return region;
  };
  
  // Find all regions
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[0].length; col++) {
      const cellKey = `${row},${col}`;
      
      // Skip if this cell has been visited or is locked
      if (visited.has(cellKey) || lockedCells.has(cellKey)) continue;
      
      // Find the region for this cell
      const region = findRegion(row, col, grid[row][col]);
      
      // Add the region if it's not empty
      if (region.size > 0) {
        regions.add(region);
      }
    }
  }
  
  return regions;
};

/**
 * Auto-completes the puzzle by simulating user moves to change all non-target colored tiles
 * Returns a new puzzle with all tiles set to the target color
 * Accurately counts the minimum number of moves needed based on connected regions
 */
export const autoCompletePuzzle = (puzzle: DailyPuzzle): DailyPuzzle => {
  // Create a deep copy of the grid
  const newGrid = puzzle.grid.map(row => [...row]);
  
  // Find all connected regions among non-locked tiles
  const allRegions = findAllRegions(newGrid, puzzle.lockedCells);
  
  // Count regions that aren't already the target color
  let additionalMovesUsed = 0;
  
  // Change all regions to the target color and count non-target regions
  for (const region of allRegions) {
    // Check if this region is already the target color
    const firstCell = region.values().next().value as string;
    const [row, col] = firstCell.split(',').map(Number);
    
    // If this region is not the target color, count it as one move
    if (newGrid[row][col] !== puzzle.targetColor) {
      additionalMovesUsed++;
      
      // Change all tiles in this region to the target color
      for (const cellKey of region) {
        const [r, c] = cellKey.split(',').map(Number);
        newGrid[r][c] = puzzle.targetColor;
      }
    }
  }
  
  // Return updated puzzle state with the accurate move count
  return {
    ...puzzle,
    grid: newGrid,
    lockedCells: new Set(), // Clear locked cells since the board is unified
    userMovesUsed: puzzle.userMovesUsed + additionalMovesUsed, // Add the moves used for autocomplete
    isSolved: true,
    isLost: false
  };
}; 