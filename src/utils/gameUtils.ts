import { TileColor, DailyPuzzle, FirestorePuzzleData } from '../types';
import { HintResult, getHint, getValidActions, computeActionDifference, NUM_COLORS, decodeActionId } from './hintUtils';
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

/**
 * Helper function to apply a single action (move) to a grid state.
 * This is used for generating difficulty-adjusted starting boards.
 * It does NOT update game state like moves used or check win/loss.
 *
 * @param grid The current grid state.
 * @param actionId The action ID from the Firestore 'actions' array.
 * @param firestoreData The Firestore puzzle data (needed for color mapping).
 * @returns The new grid state after applying the action.
 */
export function applyActionToGrid(
    grid: TileColor[][],
    actionId: number,
    firestoreData: FirestorePuzzleData
): TileColor[][] {
    // Use the existing decoder from hintUtils
    const hint = decodeActionId(actionId, firestoreData);

    if (!hint || !hint.valid) {
        console.warn(`applyActionToGrid: Invalid actionId ${actionId} provided.`);
        return grid; // Return original grid if action is invalid
    }

    const { row, col, newColor } = hint;
    const oldColor = grid[row][col];

    // If the new color is the same as the old, no change needed
    if (oldColor === newColor) {
        return grid;
    }

    // Create a copy of the grid to modify
    const newGrid = grid.map(r => [...r]);
    const [rowsChanged, colsChanged] = floodFill(newGrid, row, col, oldColor);

    rowsChanged.forEach((r, i) => {
        newGrid[r][colsChanged[i]] = newColor;
    });

    return newGrid;
}

// Apply a color change to the grid based on user interaction
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

  const newLockedCells = findLargestRegion(newGrid); // Recalculate largest region based on the new grid
  let newIsSolved = false;
  let newIsLost = false;
  const newUserMoves = puzzle.userMovesUsed + 1;

  // Determine which set of locked cells to use:
  // Only update if the new largest region is STRICTLY larger than the previous one.
  const finalLockedCells = newLockedCells.size > puzzle.lockedCells.size
    ? newLockedCells
    : puzzle.lockedCells; // Keep the old locked cells if the new region isn't bigger

  // Check win/loss conditions based on the NEW grid state
  if (isBoardUnified(newGrid)) {
    if (newGrid[0][0] === puzzle.targetColor) {
      newIsSolved = true;
      // On win, locked cells will be cleared below
    } else {
      newIsLost = true; // Unified but wrong color
    }
  } else if (finalLockedCells.size >= 13) { // Check based on the potentially updated locked cells
    // Check if the determined largest region (whether old or new) is the wrong color
    // Ensure finalLockedCells is not empty before accessing its first element
    if (finalLockedCells.size > 0) {
        const firstCellKey = finalLockedCells.values().next().value as string;
        const [fr, fc] = firstCellKey.split(',').map(Number);
        if (newGrid[fr][fc] !== puzzle.targetColor) {
          newIsLost = true; // Locked region >= 13 and wrong color
        }
    }
  }

  // Return updated puzzle state
  return {
    ...puzzle,
    grid: newGrid, // The grid reflects the latest user move
    // Use the conditionally determined locked cells, unless solved
    lockedCells: newIsSolved ? new Set() : finalLockedCells,
    userMovesUsed: newUserMoves,
    isSolved: newIsSolved,
    isLost: newIsLost,
    // startingGrid and effectiveStartingMoveIndex remain unchanged by user moves
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
  isOnOptimalPath: boolean // Note: This might become less reliable with difficulty changes
): HintResult | null => {
  if (!puzzle || !firestoreData || !firestoreData.actions || puzzle.isSolved || puzzle.isLost) {
    return null;
  }

  // Calculate the index in the optimal actions array based on user moves and difficulty start
  const optimalActionIndex = puzzle.userMovesUsed + puzzle.effectiveStartingMoveIndex;

  // Check if the calculated index is valid
  if (optimalActionIndex < 0 || optimalActionIndex >= firestoreData.actions.length) {
      console.warn(`Calculated optimalActionIndex ${optimalActionIndex} is out of bounds (actions length: ${firestoreData.actions.length}). Cannot provide optimal hint.`);
      // Optional: Implement dynamic hint calculation here as a fallback if needed
      // For now, return null if off the known optimal path for this difficulty start
      return null;
  }

  // Get the next optimal action ID based on the effective index
  const nextActionId = firestoreData.actions[optimalActionIndex];

  // Decode the action ID into a hint
  const hint = decodeActionId(nextActionId, firestoreData);

  // Add connected cells information if the hint is valid
  if (hint && hint.valid) {
    // Ensure row/col are valid before accessing grid
    if (hint.row >= 0 && hint.row < puzzle.grid.length && hint.col >= 0 && hint.col < puzzle.grid[0].length) {
        const currentColor = puzzle.grid[hint.row][hint.col];
        const [rowIndices, colIndices] = floodFill(puzzle.grid, hint.row, hint.col, currentColor);
        hint.connectedCells = rowIndices.map((r, i) => [r, colIndices[i]]);
    } else {
        console.warn(`Hint coordinates (${hint.row}, ${hint.col}) are out of bounds for the grid.`);
        hint.valid = false; // Mark hint as invalid if coordinates are bad
    }
  }

  return hint && hint.valid ? hint : null;
}; 