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
export function decodeActionId(actionId: number): HintResult {
  const row = Math.floor(actionId / (GRID_SIZE * NUM_COLORS));
  const remainder = actionId % (GRID_SIZE * NUM_COLORS);
  const col = Math.floor(remainder / NUM_COLORS);
  const colorIndex = remainder % NUM_COLORS;
  
  // Convert color index to TileColor
  const colorValues = Object.values(TileColor);
  const newColor = colorValues[colorIndex] as TileColor;
  
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
  return decodeActionId(actionId);
}
