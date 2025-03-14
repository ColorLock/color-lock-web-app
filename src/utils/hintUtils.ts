import { TileColor, FirestorePuzzleData } from '../types';

// Constants
const GRID_SIZE = 5;
export const NUM_COLORS = 6; // Assuming 6 colors based on the TileColor enum

// Interface for the decoded hint
export interface HintResult {
  row: number;
  col: number;
  newColor: TileColor;
  valid: boolean;
}

/**
 * Helper function for flood fill - matching Python implementation
 */
function _floodFillSimple(
  grid: TileColor[][],
  row: number,
  col: number,
  color: TileColor
): [number, number][] {
  const visited = new Set<string>();
  const stack: [number, number][] = [[row, col]];
  const changedCells: [number, number][] = [];
  
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    const key = `${r},${c}`;
    
    // Match Python's order of checks
    if (visited.has(key)) {
      continue;
    }
    
    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
      if (grid[r][c] === color) {
        visited.add(key);
        changedCells.push([r, c]);
        
        // Add all neighbors like Python's stack.extend()
        stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
      }
    }
  }
  
  return changedCells;
}

/**
 * Helper function for static flood fill - matching Python implementation
 */
function _floodFillStatic(
  grid: TileColor[][],
  startR: number,
  startC: number,
  color: TileColor
): [number, Set<string>] {
  const regionCells = new Set<string>();
  const stack: [number, number][] = [[startR, startC]];
  
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    const key = `${r},${c}`;
    
    // Match Python's order of checks
    if (regionCells.has(key)) {
      continue;
    }
    
    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
      if (grid[r][c] === color) {
        regionCells.add(key);
        
        // Match Python's individual append calls to preserve order
        stack.push([r + 1, c]);
        stack.push([r - 1, c]);
        stack.push([r, c + 1]);
        stack.push([r, c - 1]);
      }
    }
  }
  
  return [regionCells.size, regionCells];
}

/**
 * Computes how good an action is by simulating it and checking the difference
 * in region sizes before and after.
 */
export function computeActionDifference(
  grid: TileColor[][],
  lockedCells: Set<string>,
  targetColor: TileColor,
  actionIdx: number,
  firestoreData: FirestorePuzzleData
): number {
  // Decode action (use SAME logic as in decodeActionId)
  const row = (GRID_SIZE - 1) - Math.floor(actionIdx / (GRID_SIZE * NUM_COLORS));
  const remainder = actionIdx % (GRID_SIZE * NUM_COLORS);
  const col = Math.floor(remainder / NUM_COLORS);
  const colorIndex = remainder % NUM_COLORS;
  
  // Get the color using the same logic as decodeActionId
  let newColor: TileColor;
  
  if (firestoreData.colorMap) {
    // Find the index where the value equals colorIndex in the colorMap array
    const mappedIndex = firestoreData.colorMap.indexOf(colorIndex);
    if (mappedIndex !== -1) {
      const colorValues = Object.values(TileColor);
      newColor = colorValues[mappedIndex] as TileColor;
    } else {
      // Fallback if value not found in colorMap
      const colorValues = Object.values(TileColor);
      newColor = colorValues[colorIndex] as TileColor;
    }
  } else {
    // Fallback to direct mapping if colorMap is not available
    const colorValues = Object.values(TileColor);
    newColor = colorValues[colorIndex] as TileColor;
  }

  // Early exit conditions
  if (!(0 <= row && row < GRID_SIZE && 0 <= col && col < GRID_SIZE)) {
    return -999999;
  }

  const oldColor = grid[row][col];
  if (newColor === oldColor) {
    return -999999;
  }

  // Check if the cell is locked
  if (lockedCells.has(`${row},${col}`)) {
    return -999999;
  }

  // Create board copy and simulate move
  const gridCopy: TileColor[][] = grid.map(row => [...row]);
  const changedCells = _floodFillSimple(gridCopy, row, col, oldColor);
  const oldColorSize = changedCells.length;

  // Track all adjacent new-color blocks and their sizes
  const adjacentBlocks: [number, [number, number]][] = []; // Store [size, [root_r, root_c]]
  const visitedCells = new Set<string>();

  for (const [r, c] of changedCells) {
    const neighbors = [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]];
    
    for (const [nr, nc] of neighbors) {
      const key = `${nr},${nc}`;
      if (!visitedCells.has(key) && 
          nr >= 0 && nr < GRID_SIZE && 
          nc >= 0 && nc < GRID_SIZE) {
        
        if (gridCopy[nr][nc] === newColor) {
          // Measure that region
          const [regionSize, regionCells] = _floodFillStatic(gridCopy, nr, nc, newColor);
          adjacentBlocks.push([regionSize, [nr, nc]]);
          
          // Add region cells to visited
          regionCells.forEach(cell => visitedCells.add(cell));
        }
      }
    }
  }

  // Get the largest block size
  const largestNewBlockSize = adjacentBlocks.length > 0 ? 
    Math.max(...adjacentBlocks.map(([size]) => size)) : 0;

  const largestInvolved = Math.max(oldColorSize, largestNewBlockSize);

  // Recolor the board
  for (const [r, c] of changedCells) {
    gridCopy[r][c] = newColor;
  }

  // Get final merged size
  const [afterSize] = _floodFillStatic(gridCopy, row, col, newColor);

  if (afterSize >= 13 && newColor !== targetColor) {
    return -999999;
  }

  // Base difference
  let difference = afterSize - largestInvolved;

  // Add bonus for combining multiple smaller blocks
  if (adjacentBlocks.length > 0) {
    // Calculate average size of blocks being combined
    const avgBlockSize = adjacentBlocks.reduce((sum, [size]) => sum + size, 0) / adjacentBlocks.length;
    // Small bonus for each additional block beyond the first
    const combinationBonus = (adjacentBlocks.length - 1) * (0.1 / avgBlockSize);
    difference += combinationBonus;
  }

  return difference;
}

/**
 * Returns a list of all valid action indices for the current board state
 */
export function getValidActions(
  grid: TileColor[][],
  lockedCells: Set<string>,
  firestoreData: FirestorePuzzleData
): number[] {
  const valid: number[] = [];
  const totalActions = GRID_SIZE * GRID_SIZE * NUM_COLORS;

  for (let actionIdx = 0; actionIdx < totalActions; actionIdx++) {
    // Use the same decoding logic as decodeActionId to ensure consistency
    const row = (GRID_SIZE - 1) - Math.floor(actionIdx / (GRID_SIZE * NUM_COLORS));
    const remainder = actionIdx % (GRID_SIZE * NUM_COLORS);
    const col = Math.floor(remainder / NUM_COLORS);
    const colorIndex = remainder % NUM_COLORS;
    
    // Get the color using the same logic as decodeActionId
    let newColor: TileColor;
    
    if (firestoreData.colorMap) {
      // Find the index where the value equals colorIndex in the colorMap array
      const mappedIndex = firestoreData.colorMap.indexOf(colorIndex);
      if (mappedIndex !== -1) {
        const colorValues = Object.values(TileColor);
        newColor = colorValues[mappedIndex] as TileColor;
      } else {
        // Fallback if value not found in colorMap
        const colorValues = Object.values(TileColor);
        newColor = colorValues[colorIndex] as TileColor;
      }
    } else {
      // Fallback to direct mapping if colorMap is not available
      const colorValues = Object.values(TileColor);
      newColor = colorValues[colorIndex] as TileColor;
    }

    // 1) If (row,col) is in locked region => invalid
    if (lockedCells.has(`${row},${col}`)) {
      continue;
    }

    // 2) If new_color == the board's current color => skip (forbid no-op)
    const oldColor = grid[row][col];
    if (newColor === oldColor) {
      continue;
    }

    // If we get here, the move is valid
    valid.push(actionIdx);
  }

  return valid;
}

/**
 * Decodes an action_id into row, column, and color
 */
export function decodeActionId(actionId: number, firestoreData: FirestorePuzzleData): HintResult {
  const row = (GRID_SIZE - 1) - Math.floor(actionId / (GRID_SIZE * NUM_COLORS));
  const remainder = actionId % (GRID_SIZE * NUM_COLORS);
  const col = Math.floor(remainder / NUM_COLORS);
  const colorIndex = remainder % NUM_COLORS;
  
  // Get the color from the firestoreData.colorMap based on colorIndex
  let newColor: TileColor;
  
  if (firestoreData.colorMap) {
    // Find the index where the value equals colorIndex in the colorMap array
    const mappedIndex = firestoreData.colorMap.indexOf(colorIndex);
    if (mappedIndex !== -1) {
      const colorValues = Object.values(TileColor);
      newColor = colorValues[mappedIndex] as TileColor;
    } else {
      // Fallback if value not found in colorMap
      const colorValues = Object.values(TileColor);
      newColor = colorValues[colorIndex] as TileColor;
    }
  } else {
    // Fallback to direct mapping if colorMap is not available
    const colorValues = Object.values(TileColor);
    newColor = colorValues[colorIndex] as TileColor;
  }
  
  return {
    row,
    col,
    newColor,
    valid: row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE
  };
}

/**
 * Gets the hint for the current move
 */
export function getHint(firestoreData: FirestorePuzzleData, moveNumber: number): HintResult | null {
  if (!firestoreData || !firestoreData.actions || moveNumber >= firestoreData.actions.length) {
    return null;
  }
  
  const actionId = firestoreData.actions[moveNumber];
  return decodeActionId(actionId, firestoreData);
} 