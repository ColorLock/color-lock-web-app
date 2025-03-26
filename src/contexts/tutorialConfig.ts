import { TileColor } from '../types';
import { TutorialStep, OverlayElement } from './TutorialContext';

/**
 * Hardcoded tutorial puzzle grid that will always be used
 */
export const TUTORIAL_PUZZLE_GRID: TileColor[][] = [
  ['red' as TileColor, 'red' as TileColor, 'orange' as TileColor, 'orange' as TileColor, 'blue' as TileColor],
  ['yellow' as TileColor, 'orange' as TileColor, 'green' as TileColor, 'yellow' as TileColor, 'red' as TileColor],
  ['yellow' as TileColor, 'blue' as TileColor, 'orange' as TileColor, 'purple' as TileColor, 'purple' as TileColor],
  ['red' as TileColor, 'blue' as TileColor, 'green' as TileColor, 'yellow' as TileColor, 'yellow' as TileColor],
  ['red' as TileColor, 'blue' as TileColor, 'red' as TileColor, 'red' as TileColor, 'yellow' as TileColor],
];

/**
 * Hardcoded tutorial solution moves
 */
export const TUTORIAL_SOLUTION_MOVES: { row: number, col: number, newColor: TileColor }[] = [
  { row: 1, col: 2, newColor: 'orange' as TileColor },
  { row: 2, col: 3, newColor: 'yellow' as TileColor },
  { row: 1, col: 2, newColor: 'blue' as TileColor },
  { row: 3, col: 4, newColor: 'red' as TileColor },
  { row: 1, col: 0, newColor: 'red' as TileColor },
  { row: 3, col: 2, newColor: 'red' as TileColor },
  { row: 0, col: 4, newColor: 'red' as TileColor },
];

/**
 * Hardcoded target color and goal moves
 */
export const TARGET_COLOR: TileColor = 'red' as TileColor;
export const GOAL_MOVES: number = 7;

/**
 * Interface for a tutorial step configuration
 */
export interface TutorialStepConfig {
  title: string;
  message: string;
  overlayElements: OverlayElement[];
}

/**
 * Returns configuration for a tutorial step
 * @param step The tutorial step to get configuration for
 * @param solutionMoves The tutorial solution moves (used for dynamic step configs)
 * @returns The tutorial step configuration
 */
export const getStepConfig = (
  step: TutorialStep, 
  solutionMoves: Array<{ row: number; col: number; newColor: TileColor; oldColor: TileColor }>
): TutorialStepConfig => {
  // Default empty config
  const defaultConfig: TutorialStepConfig = {
    title: '',
    message: '',
    overlayElements: []
  };
  
  // Return specific config based on current step
  switch (step) {
    case TutorialStep.INTRO:
      return {
        title: 'Color Lock Tutorial',
        message: 'Every day, Color Lock provides a new puzzle for you to solve. To win, you must turn every tile on the board into the target color.<br /><br />Clicking on the outlined items above provides more information about each item.',
        overlayElements: [
          {
            type: 'highlight',
            target: '.target-row',
            color: '#3498db',
            position: 'top',
            description: 'Turn all tiles to this target color'
          },
          {
            type: 'highlight',
            target: '.goal-row span:first-child',
            color: '#e74c3c',
            position: 'left',
            description: 'Number of moves our bot needed to solve this puzzle'
          },
          {
            type: 'highlight',
            target: '.goal-row span:last-child',
            color: '#2ecc71',
            position: 'bottom',
            description: 'Your current move count'
          },
          {
            type: 'highlight',
            target: '.settings-button',
            color: '#9b59b6',
            position: 'left',
            description: 'Game settings'
          },
          {
            type: 'highlight',
            target: '.stats-button',
            color: '#e67e22',
            position: 'left',
            description: 'View your stats'
          }
        ]
      };
    
    case TutorialStep.FIRST_MOVE_SELECTION:
      return {
        title: 'Let\'s Practice: Select a Tile',
        message: 'Make your first move by clicking on the green tile that is flashing with a red border.',
        overlayElements: []
      };
    
    case TutorialStep.COLOR_SELECTION:
      return {
        title: 'Select a Color',
        message: 'Click the orange square in the modal that just appeared on the bottom of the screen. This changes the green tile to orange.',
        overlayElements: []
      };
    
    case TutorialStep.LOCKED_REGIONS:
      return {
        title: 'Locked Regions',
        message: 'Great! In Color Lock, the largest group of tiles is locked, which means their color cannot be changed. By changing the green tile to orange you connected a total of 5 tiles, creating a new largest group.',
        overlayElements: []
      };
    
    case TutorialStep.SOLUTION_DEMONSTRATION:
      return {
        title: 'Automatic Solution',
        message: 'Now that we\'ve seen how to change a tile and how the lock functionality works, let\'s take you through the rest of the solution for this puzzle.',
        overlayElements: []
      };
    
    case TutorialStep.WINNING_COMPLETION:
      return {
        title: 'Congratulations!',
        message: 'You\'ve completed the Color Lock tutorial! Click the button below to play today\'s puzzle.',
        overlayElements: []
      };
    
    default:
      return defaultConfig;
  }
}; 