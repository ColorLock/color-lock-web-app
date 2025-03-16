import { TileColor } from '../types';
import { ColorBlindMode, AppSettings } from '../types/settings';

// Function to get adjusted colors based on color blindness setting
export const getAdjustedColorCSS = (color: TileColor, settings: AppSettings): string => {
  // For custom color scheme
  if (settings.customColorScheme[color]) {
    return settings.customColorScheme[color] as string;
  }
  
  // For color blind modes
  if (settings.colorBlindMode !== ColorBlindMode.None) {
    const colorBlindPresets: Record<ColorBlindMode, Record<TileColor, string>> = {
      [ColorBlindMode.Protanopia]: {
        [TileColor.Red]: '#a0a0a0', // Gray instead of red
        [TileColor.Green]: '#f5f5a0', // Yellow-ish instead of green
        [TileColor.Blue]: 'rgb(52,120,247)', // Use the new blue
        [TileColor.Yellow]: 'rgb(247,206,69)', // Use the new yellow
        [TileColor.Purple]: '#a0a0ff', // Light blue instead of purple
        [TileColor.Orange]: '#f5f5a0', // Yellow-ish instead of orange
      },
      [ColorBlindMode.Deuteranopia]: {
        [TileColor.Red]: 'rgb(235,78,62)', // Use the new red
        [TileColor.Green]: '#a0a0a0', // Gray instead of green
        [TileColor.Blue]: 'rgb(52,120,247)', // Use the new blue
        [TileColor.Yellow]: 'rgb(247,206,69)', // Use the new yellow
        [TileColor.Purple]: 'rgb(163,7,215)', // Use the new purple
        [TileColor.Orange]: 'rgb(235,78,62)', // Red-ish instead of orange (using the new red)
      },
      [ColorBlindMode.Tritanopia]: {
        [TileColor.Red]: 'rgb(235,78,62)', // Use the new red
        [TileColor.Green]: 'rgb(101,196,102)', // Use the new green
        [TileColor.Blue]: '#a0a0a0', // Gray instead of blue
        [TileColor.Yellow]: 'rgb(235,78,62)', // Red-ish instead of yellow (using the new red)
        [TileColor.Purple]: 'rgb(163,7,215)', // Use the new purple
        [TileColor.Orange]: 'rgb(241,154,56)', // Use the new orange
      },
      [ColorBlindMode.None]: {} as Record<TileColor, string> // This is a placeholder
    };
    
    if (colorBlindPresets[settings.colorBlindMode][color]) {
      return colorBlindPresets[settings.colorBlindMode][color];
    }
  }
  
  // Use default colors enhanced for high contrast mode if enabled
  const baseColorMap = {
    [TileColor.Red]: settings.highContrastMode ? 'rgb(235,78,62)' : 'rgb(235,78,62)',
    [TileColor.Green]: settings.highContrastMode ? 'rgb(101,196,102)' : 'rgb(101,196,102)',
    [TileColor.Blue]: settings.highContrastMode ? 'rgb(52,120,247)' : 'rgb(52,120,247)',
    [TileColor.Yellow]: settings.highContrastMode ? 'rgb(247,206,69)' : 'rgb(247,206,69)',
    [TileColor.Purple]: settings.highContrastMode ? 'rgb(163,7,215)' : 'rgb(163,7,215)',
    [TileColor.Orange]: settings.highContrastMode ? 'rgb(241,154,56)' : 'rgb(241,154,56)',
  };
  
  return baseColorMap[color] || '#ffffff';
};

// Get color CSS for a TileColor
export const getColorCSS = (color: TileColor, settings: AppSettings): string => {
  return getAdjustedColorCSS(color, settings);
};

// Get the color of locked squares
export const getLockedSquaresColor = (grid: TileColor[][], lockedCells: Set<string>): TileColor | null => {
  // If no locked cells, return null
  if (!lockedCells?.size) return null;
  
  // Get the first locked cell coordinates
  const firstLockedCell = Array.from(lockedCells)[0];
  if (!firstLockedCell) return null;
  
  // Convert 'row,col' string to row and col numbers
  const [row, col] = firstLockedCell.split(',').map(Number);
  
  // Return the color of that locked cell from the grid
  return grid[row][col];
};

// Get CSS color for the locked count
export const getLockedColorCSS = (grid: TileColor[][], lockedCells: Set<string>, settings: AppSettings): string => {
  const lockedColor = getLockedSquaresColor(grid, lockedCells);
  // Use the color of locked squares, or white if not available
  return lockedColor !== null ? getColorCSS(lockedColor, settings) : '#ffffff';
}; 