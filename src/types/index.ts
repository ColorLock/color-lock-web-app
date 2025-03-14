// Types & Data
export enum TileColor {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
  Yellow = 'yellow',
  Purple = 'purple',
  Orange = 'orange'
}

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
  grid: TileColor[][];
  userMovesUsed: number;
  isSolved: boolean;
  isLost: boolean;
  lockedCells: Set<string>;
  targetColor: TileColor;
  startingGrid: TileColor[][]; // Deep-copied initial grid
  bestScoreUsed: number | null;
  timesPlayed: number;
  totalMovesForThisBoard: number;
  algoScore: number;
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