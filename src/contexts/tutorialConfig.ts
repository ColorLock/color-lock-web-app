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
        message: 'Every day, Color Lock provides a new puzzle for you to solve. To win, you must turn every tile on the board into the target color.',
        overlayElements: []
      };
    
      case TutorialStep.ALGORITHM_INTRO:
      return {
        title: 'Algorithm Solution',
        message: 'The Goal, highlighted above in red, is the amount of moves our algorithm needed to solve the puzzle.',
        overlayElements: [
          {
            type: 'highlight',
            target: '.goal-row span:first-child',
            color: 'red',
            position: 'bottom'
          }
        ]
      };

    case TutorialStep.MOVES_EXPLANATION:
      return {
        title: 'Moves Counter',
        message: 'The moves counter shows how many moves you\'ve made in your current game.',
        overlayElements: [
          {
            type: 'highlight',
            target: '.goal-row span:last-child',
            color: 'red',
            position: 'bottom'
          }
        ]
      };
    
    case TutorialStep.FIRST_MOVE_SELECTION:
      return {
        title: 'Select a Tile',
        message: 'Make your first move by clicking on the green tile that is flashing with a red border.',
        overlayElements: []
      };
    
    case TutorialStep.COLOR_SELECTION:
      return {
        title: 'Select a Color',
        message: 'Now, click the orange square on the color picker that just appeared on the bottom of the screen. This changes the green tile we clicked to orange.',
        overlayElements: []
      };
    
    case TutorialStep.LOCKED_REGIONS:
      return {
        title: 'Locked Regions',
        message: 'Great! In Color Lock, the largest group of tiles is locked, which means their color cannot be changed. By changing the green tile to orange you connected a total of 5 tiles, creating a new largest group.',
        overlayElements: []
      };
    
    case TutorialStep.ALGORITHM_MOVE_2:
      return {
        title: 'Move 2',
        message: 'Let\'s keep going. Click continue to change the two purple tiles to yellow. Notice, the two purple tiles are connected by a side. Once tiles of the same color are connected they cannot be broken up, and changing one of the connected tiles to a new color will change all connected tiles to that color.',
        overlayElements: []
      };

      case TutorialStep.CRITICAL_MOVE:
        return {
          title: 'Critical Move',
          message: 'You can see that we freed up the orange tiles by creating a new group of a larger size! We are now going to change those newly freed up tiles from orange to yellow.',
          overlayElements: []
        };
      
      case TutorialStep.LOSING_SCENARIO:
        return {
          title: 'Losing Scenario',
          message: 'Uh Oh! Changing those tiles to yellow resulted in a losing scenario. Since there are only 25 total tiles and the yellow group has 13 tiles we can never unlock this group to change it to the target color! Click continue to revert the board back to its previous state so we can make a better move.',
          overlayElements: []
        };
    
    case TutorialStep.ALGORITHM_MOVE_3:
      if (solutionMoves.length > 2) {
        const move = solutionMoves[2];
        return {
          title: 'Move 3',
          message: `Instead of changing orange to yellow, let's change the group to blue.`,
          overlayElements: []
        };
      }
      return defaultConfig;
    
    case TutorialStep.ALGORITHM_MOVE_4:
      if (solutionMoves.length > 3) {
        const move = solutionMoves[3];
        return {
          title: 'Move 4',
          message: `Let's continue solving the puzzle by changing ${move.oldColor} to ${move.newColor}.`,
          overlayElements: []
        };
      }
      return defaultConfig;
    
    case TutorialStep.ALGORITHM_MOVE_5:
      if (solutionMoves.length > 4) {
        const move = solutionMoves[4];
        return {
          title: 'Move 5',
          message: `Next we will change the other group of ${move.oldColor}s to ${move.newColor}.`,
          overlayElements: []
        };
      }
      return defaultConfig;
    
    case TutorialStep.ALGORITHM_MOVE_6:
      if (solutionMoves.length > 5) {
        const move = solutionMoves[5];
        return {
          title: 'Move 6',
          message: `For our sixth move, let's change ${move.oldColor} to ${move.newColor}. This will again create a new largest group of connected cells, unlocking the blue and allowing us to solve the puzzle.`,
          overlayElements: []
        };
      }
      return defaultConfig;
    
    case TutorialStep.ALGORITHM_MOVE_7:
      if (solutionMoves.length > 6) {
        const move = solutionMoves[6];
        return {
          title: 'Move 7',
          message: `Finally, let's change ${move.oldColor} to ${move.newColor} and solve the puzzle!`,
          overlayElements: []
        };
      }
      return defaultConfig;
    
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