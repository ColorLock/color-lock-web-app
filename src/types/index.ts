// Types & Data
export enum TileColor {
  // yellow: 247,206,69
  // red: 235,78,62
  // green: 101,196,102
  // orange: 241,154,56
  // purple: 163,7,215
  // blue: 52,120,247
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
  Yellow = 'yellow',
  Purple = 'purple',
  Orange = 'orange'
}

// can you please change the colors of the board to the following rgb:

// yellow: 247,206,69
// red: 235,78,62
// green: 101,196,102
// orange: 241,154,56
// purple: 163,7,215
// blue: 52,120,247

export const allColors = [
  TileColor.Red,
  TileColor.Green,
  TileColor.Blue,
  TileColor.Yellow,
  TileColor.Purple,
  TileColor.Orange
];

export interface DailyPuzzle {
  dateString: string;
  grid: TileColor[][]; // The grid state the user starts playing with (difficulty adjusted)
  userMovesUsed: number;
  isSolved: boolean;
  isLost: boolean;
  lockedCells: Set<string>;
  targetColor: TileColor;
  startingGrid: TileColor[][]; // The TRUE initial grid from the database (unmodified)
  bestScoreUsed: number | null;
  timesPlayed: number;
  totalMovesForThisBoard: number;
  algoScore: number; // Remains the score from the TRUE initial state
  effectiveStartingMoveIndex: number; // 0 for Hard, 1 for Medium, 3 for Easy
}

export interface PuzzleGrid {
  [row: string]: TileColor[];
}

// Define the Firestore data structure
export interface FirestorePuzzleData {
  algoScore: number;
  targetColor: TileColor;
  states: PuzzleGrid[];
  actions: number[];
  colorMap?: number[];
} 