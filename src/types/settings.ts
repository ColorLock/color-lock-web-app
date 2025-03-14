import { TileColor } from './index';

/**
 * Color blindness options
 */
export enum ColorBlindMode {
  None = "none",
  Protanopia = "protanopia",
  Deuteranopia = "deuteranopia",
  Tritanopia = "tritanopia"
}

/**
 * Application settings interface
 */
export interface AppSettings {
  // Accessibility settings
  highContrastMode: boolean;
  colorBlindMode: ColorBlindMode;
  customColorScheme: {
    [key in TileColor]?: string;
  };
  
  // Visual settings
  highlightLargestRegion: boolean;
  enableAnimations: boolean;
  
  // Game settings
  enableSoundEffects: boolean;
  showOptimalPath: boolean;
  showLockedRegionCounter: boolean;
}

/**
 * Default settings
 */
export const defaultSettings: AppSettings = {
  highContrastMode: false,
  colorBlindMode: ColorBlindMode.None,
  customColorScheme: {},
  highlightLargestRegion: true,
  enableAnimations: true,
  enableSoundEffects: false,
  showOptimalPath: false,
  showLockedRegionCounter: true
}; 