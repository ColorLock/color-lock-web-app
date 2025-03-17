import React, { useState, useEffect } from 'react';
import '../scss/main.scss';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { TileColor } from '../types';
import { AppSettings, ColorBlindMode, DifficultyLevel, defaultSettings } from '../types/settings';

// Define the SettingsModal props
interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (newSettings: AppSettings) => void;
}

// SettingsModal component
const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  settings, 
  onSettingsChange 
}) => {
  // Local state for settings before saving
  const [localSettings, setLocalSettings] = useState<AppSettings>({...settings});

  // Update local settings when props change or when modal opens
  useEffect(() => {
    if (isOpen) {
      // Reset local settings to current app settings when modal opens
      setLocalSettings({...settings});
    }
  }, [isOpen, settings]);

  // Handle toggle changes
  const handleToggleChange = (key: keyof AppSettings, value: boolean) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Handle select changes (for color blind modes)
  const handleSelectChange = (key: keyof AppSettings, value: any) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Save settings and close modal
  const handleSave = () => {
    onSettingsChange(localSettings);
    onClose();
  };

  // Cancel without saving changes
  const handleCancel = () => {
    // Reset to the current settings without saving changes
    setLocalSettings({...settings});
    onClose();
  };

  // Color blind mode color mappings
  const colorBlindPresets = {
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
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button 
            className="close-button settings-close-button" 
            onClick={handleCancel}
            aria-label="Close settings"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="settings-content">
          <section className="settings-section">
            <h3>Accessibility</h3>
            
            <div className="setting-item">
              <label htmlFor="high-contrast">
                High Contrast Mode
                <p className="setting-description">Increases contrast between tiles for better visibility</p>
              </label>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  id="high-contrast"
                  checked={localSettings.highContrastMode}
                  onChange={(e) => handleToggleChange('highContrastMode', e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="setting-item">
              <label htmlFor="color-blind-mode">
                Color Blind Mode
                <p className="setting-description">Adjusts colors for different types of color blindness</p>
              </label>
              <select
                id="color-blind-mode"
                value={localSettings.colorBlindMode}
                onChange={(e) => handleSelectChange('colorBlindMode', e.target.value as ColorBlindMode)}
                className="settings-select"
              >
                <option value={ColorBlindMode.None}>None</option>
                <option value={ColorBlindMode.Protanopia}>Protanopia (Red-Weak)</option>
                <option value={ColorBlindMode.Deuteranopia}>Deuteranopia (Green-Weak)</option>
                <option value={ColorBlindMode.Tritanopia}>Tritanopia (Blue-Weak)</option>
              </select>
            </div>
          </section>

          <section className="settings-section">
            <h3>Visual Settings</h3>
            
            <div className="setting-item">
              <label htmlFor="highlight-region">
                Highlight Largest Region
                <p className="setting-description">Visually highlight the largest connected region</p>
              </label>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  id="highlight-region"
                  checked={localSettings.highlightLargestRegion}
                  onChange={(e) => handleToggleChange('highlightLargestRegion', e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="setting-item">
              <label htmlFor="enable-animations">
                Enable Animations
                <p className="setting-description">Show animations for tiles and effects</p>
              </label>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  id="enable-animations"
                  checked={localSettings.enableAnimations}
                  onChange={(e) => handleToggleChange('enableAnimations', e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="setting-item">
              <label htmlFor="show-locked-counter">
                Show Locked Region Counter
                <p className="setting-description">Display the counter for locked regions</p>
              </label>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  id="show-locked-counter"
                  checked={localSettings.showLockedRegionCounter}
                  onChange={(e) => handleToggleChange('showLockedRegionCounter', e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </section>

          <section className="settings-section">
            <h3>Game</h3>
            
            <div className="setting-item">
              <label htmlFor="enable-sound">
                Enable Sound Effects
                <p className="setting-description">Play sounds for game actions</p>
              </label>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  id="enable-sound"
                  checked={localSettings.enableSoundEffects}
                  onChange={(e) => handleToggleChange('enableSoundEffects', e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="setting-item difficulty-setting-item">
              <div className="difficulty-header">
                <label htmlFor="difficulty-level">
                  Difficulty Level
                  <p className="setting-description">Adjust game difficulty (affects goal number)</p>
                </label>
              </div>
              
              <div className="difficulty-selector">
                <div className="difficulty-segmented-control">
                  <button 
                    className={`difficulty-segment ${localSettings.difficultyLevel === DifficultyLevel.Easy ? 'active' : ''}`}
                    onClick={() => handleSelectChange('difficultyLevel', DifficultyLevel.Easy)}
                  >
                    Easy (+3)
                  </button>
                  <button 
                    className={`difficulty-segment ${localSettings.difficultyLevel === DifficultyLevel.Medium ? 'active' : ''}`}
                    onClick={() => handleSelectChange('difficultyLevel', DifficultyLevel.Medium)}
                  >
                    Medium (+1)
                  </button>
                  <button 
                    className={`difficulty-segment ${localSettings.difficultyLevel === DifficultyLevel.Hard ? 'active' : ''}`}
                    onClick={() => handleSelectChange('difficultyLevel', DifficultyLevel.Hard)}
                  >
                    Hard
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="settings-footer">
          <button className="settings-save-button" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal; 