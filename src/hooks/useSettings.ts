import { useState, useCallback } from 'react';
import { AppSettings, defaultSettings } from '../types/settings';
import { loadSettings, saveSettings } from '../utils/storageUtils';

/**
 * Custom hook for managing application settings
 */
export default function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings(defaultSettings));
  
  /**
   * Update settings and save to localStorage
   */
  const updateSettings = useCallback((newSettings: AppSettings) => {
    console.log("Applying new settings:", newSettings);
    
    setSettings(prevSettings => {
      // First check if any settings actually changed to avoid unnecessary rerenders
      const hasChanges = Object.keys(newSettings).some(key => {
        const k = key as keyof AppSettings;
        // Deep compare for objects like customColorScheme
        if (k === 'customColorScheme') {
          return JSON.stringify(newSettings[k]) !== JSON.stringify(prevSettings[k]);
        }
        return newSettings[k] !== prevSettings[k];
      });
      
      if (hasChanges) {
        // Only update if there are actual changes
        const updatedSettings = {...newSettings};
        // Save to localStorage immediately
        saveSettings(updatedSettings);
        return updatedSettings;
      }
      
      return prevSettings;
    });
  }, []);
  
  return { settings, updateSettings };
} 