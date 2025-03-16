import React, { useContext, useEffect } from 'react';
import { TileColor } from '../types';
import { SettingsContext } from '../App';

interface AutocompleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAutoComplete: () => void;
  targetColor: TileColor;
  getColorCSS: (color: TileColor) => string;
}

const AutocompleteModal: React.FC<AutocompleteModalProps> = ({ 
  isOpen, 
  onClose, 
  onAutoComplete, 
  targetColor,
  getColorCSS
}) => {
  const settings = useContext(SettingsContext);
  const soundEnabled = settings?.enableSoundEffects || false;

  // Play sound when modal opens (if enabled)
  useEffect(() => {
    if (isOpen && soundEnabled) {
      const audio = new Audio('/sounds/hint-sound.mp3');
      audio.volume = 0.5;
      audio.play().catch(err => console.warn('Could not play sound:', err));
    }
  }, [isOpen, soundEnabled]);

  // Early return after the hook
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="autocomplete-modal autocomplete-modal-animated">
        <h2 className="congratulations-title">Auto-Complete Available</h2>
        
        <div className="unlocked-message">
          You've almost solved the puzzle! The locked region has 22 tiles of the target color.
        </div>
        
        <div className="autocomplete-content">
          <p>
            Would you like to auto-complete the remaining tiles to 
            <span className="color-name" style={{color: getColorCSS(targetColor)}}> {targetColor}</span>?
          </p>
        </div>
        
        <div className="modal-buttons">
          <button className="share-button" onClick={onAutoComplete}>
            Yes, complete it
          </button>
          <button className="inverse-share-button" onClick={onClose}>
            No, I'll continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default AutocompleteModal; 