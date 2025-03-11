import { TileColor, FirestorePuzzleData } from './App';

// Constants
const GRID_SIZE = 5;
const NUM_COLORS = 6; // Assuming 6 colors based on the TileColor enum

// Interface for the decoded hint
export interface HintResult {
  row: number;
  col: number;
  newColor: TileColor;
  valid: boolean;
}

/**
 * Decodes an action_id into row, column, and color
 */
export function decodeActionId(actionId: number, firestoreData: FirestorePuzzleData): HintResult {
  // Get the original row value
  const originalRow = Math.floor(actionId / (GRID_SIZE * NUM_COLORS));
  
  // Reverse the row mapping (0→4, 1→3, 2→2, 3→1, 4→0)
  const row = (GRID_SIZE - 1) - originalRow;
  
  const remainder = actionId % (GRID_SIZE * NUM_COLORS);
  const col = Math.floor(remainder / NUM_COLORS);
  const colorIndex = remainder % NUM_COLORS;
  
  // Get the color from the firestoreData.colorMap based on colorIndex
  let newColor: TileColor;
  
  if (firestoreData.colorMap && colorIndex < firestoreData.colorMap.length) {
    // Use the colorMap to get the mapped color index
    const mappedColorIndex = firestoreData.colorMap[colorIndex];
    const colorValues = Object.values(TileColor);
    newColor = colorValues[mappedColorIndex] as TileColor;
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
