import { TileColor, DailyPuzzle, FirestorePuzzleData } from '../types';
import { HintResult, getHint, getValidActions, computeActionDifference, NUM_COLORS } from './hintUtils';
import { floodFill, findLargestRegion, isBoardUnified } from './gameLogic';

// Grid size constant
export const GRID_SIZE = 5;

// More detailed locked region analysis
export function getLockedRegionsInfo(grid: TileColor[][], lockedCells: Set<string>): { 
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

// Check if the current grid matches the expected state
export const checkIfOnOptimalPath = (
  grid: TileColor[][], 
  moveNumber: number, 
  firestoreData: FirestorePuzzleData | null
): boolean => {
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

// Apply a color change to the grid with flooding
export const applyColorChange = (
  puzzle: DailyPuzzle, 
  row: number, 
  col: number, 
  newColor: TileColor
): DailyPuzzle => {
  // If the selected color is the same as the current color, no change
  const oldColor = puzzle.grid[row][col];
  if (oldColor === newColor) {
    return puzzle;
  }
  
  // Create a copy of the grid to modify
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

  // Return updated puzzle state
  return {
    ...puzzle,
    grid: newGrid,
    lockedCells: newLockedCells,
    userMovesUsed: newUserMoves,
    isSolved: newIsSolved,
    isLost: newIsLost
  };
};

// Decode action ID to hint (similar to the one in hints.tsx)
export const decodeActionIdToHint = (
  actionId: number, 
  firestoreData: FirestorePuzzleData,
  grid: TileColor[][]
): HintResult => {
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
  
  // Get the current color at this position
  const currentColor = grid[row][col];
  
  // Find connected cells with the same current color
  const [rowIndices, colIndices] = floodFill(grid, row, col, currentColor);
  const connectedCells: [number, number][] = rowIndices.map((r, i) => [r, colIndices[i]]);
  
  return {
    row,
    col,
    newColor,
    valid: row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE,
    connectedCells
  };
};

// Get a hint for the current puzzle state
export const getGameHint = (
  puzzle: DailyPuzzle, 
  firestoreData: FirestorePuzzleData | null,
  isOnOptimalPath: boolean
): HintResult | null => {
  if (!puzzle || !firestoreData) {
    return null;
  }

  if (puzzle.isSolved || puzzle.isLost) {
    return null;
  }

  let hint: HintResult | null = null;
  
  if (isOnOptimalPath) {
    // User is on the optimal path, use the predefined next action
    hint = getHint(firestoreData, puzzle.userMovesUsed);
    
    // If we got a hint, add connected cells info
    if (hint && hint.valid) {
      const currentColor = puzzle.grid[hint.row][hint.col];
      const [rowIndices, colIndices] = floodFill(puzzle.grid, hint.row, hint.col, currentColor);
      hint.connectedCells = rowIndices.map((r, i) => [r, colIndices[i]]);
    }
  } else {
    // User has deviated, calculate the best action dynamically
    
    // Get all valid actions
    const validActions = getValidActions(puzzle.grid, puzzle.lockedCells, firestoreData);
    
    if (validActions.length === 0) {
      return null;
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
      hint = decodeActionIdToHint(bestActionIdx, firestoreData, puzzle.grid);
    }
  }
  
  return hint && hint.valid ? hint : null;
}; 