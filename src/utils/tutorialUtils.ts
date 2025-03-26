import { TileColor, FirestorePuzzleData, DailyPuzzle } from '../types';
import { TutorialMove } from '../contexts/TutorialContext';
import { decodeActionIdToHint, applyColorChange } from './gameUtils';

/**
 * Extract the solution moves from the Firestore data for the tutorial
 * 
 * This function takes the puzzle data and Firestore data and converts it into a series of
 * tutorial moves that can be demonstrated to the user. The function simulates applying each
 * move to ensure that subsequent moves operate on the correct board state.
 * 
 * @param puzzle The daily puzzle object with grid and metadata
 * @param firestoreData The raw Firestore data containing encoded actions
 * @returns An array of TutorialMove objects representing the solution
 */
export const extractSolutionMoves = (
  puzzle: DailyPuzzle,
  firestoreData: FirestorePuzzleData
): TutorialMove[] => {
  if (!puzzle || !firestoreData) return [];
  
  const moves: TutorialMove[] = [];
  // Create a deep copy of the starting grid to simulate moves
  const startingGrid = puzzle.startingGrid.map(row => [...row]);
  
  // Extract all moves from the firestoreData
  for (let i = 0; i < firestoreData.actions.length; i++) {
    const actionId = firestoreData.actions[i];
    // Decode the action ID into a move hint
    const hint = decodeActionIdToHint(actionId, firestoreData, startingGrid);
    
    if (hint && hint.valid) {
      // Store the old color before changing it
      const oldColor = startingGrid[hint.row][hint.col];
      
      // Add the move to our list of tutorial moves
      moves.push({
        row: hint.row,
        col: hint.col,
        newColor: hint.newColor,
        oldColor
      });
      
      // Apply the move to keep the grid updated for next moves
      const { row, col, newColor } = hint;
      const updatedPuzzle = applyColorChange(
        { ...puzzle, grid: startingGrid },
        row,
        col,
        newColor
      );
      
      // Update the starting grid for next move
      updatedPuzzle.grid.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
          startingGrid[rowIndex][colIndex] = cell;
        });
      });
    }
  }
  
  return moves;
};

/**
 * Apply a tutorial move to a grid
 * 
 * This function takes a grid and a tutorial move, applies the move to the grid, 
 * and returns the updated grid. It uses the applyColorChange function from gameUtils,
 * which handles the floodFill logic that changes connected tiles of the same color.
 * 
 * @param grid The current tile grid
 * @param move The tutorial move to apply
 * @returns A new grid with the move applied
 */
export const applyTutorialMove = (
  grid: TileColor[][],
  move: TutorialMove
): TileColor[][] => {
  // Create a minimal puzzle object with the given grid
  // The targetColor doesn't matter for this function as we're just
  // using it to pass to applyColorChange
  const puzzle: DailyPuzzle = {
    grid,
    userMovesUsed: 0,
    isSolved: false,
    isLost: false,
    lockedCells: new Set<string>(),
    targetColor: 'blue' as TileColor, // Doesn't matter for this function
    startingGrid: grid,
    dateString: '',
    bestScoreUsed: null,
    timesPlayed: 0,
    totalMovesForThisBoard: 0,
    algoScore: 0
  };
  
  // Use the applyColorChange function to apply the move
  // This will handle changing all connected tiles of the same color
  const updatedPuzzle = applyColorChange(
    puzzle,
    move.row,
    move.col,
    move.newColor
  );
  
  // Return just the updated grid
  return updatedPuzzle.grid;
}; 