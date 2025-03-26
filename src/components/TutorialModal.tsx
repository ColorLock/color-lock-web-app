import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { useTutorialContext, TutorialStep } from '../contexts/TutorialContext';
import { useModalClickOutside } from '../utils/modalUtils';
import { debugLog, LogLevel } from '../utils/debugUtils';
import { TileColor } from '../types';

/**
 * Props for the TutorialModal component
 */
interface TutorialModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Function to call when the modal is closed */
  onClose: () => void;
  /** Type of modal to display - intro shows the initial tutorial prompt, step shows tutorial instructions */
  type?: 'intro' | 'step';
}

/**
 * Helper function to colorize color names in text
 * @param text The text to process
 * @returns React nodes with colored spans for color names
 */
const colorizeText = (text: string): string => {
  // Define color mappings (color name to CSS color)
  const colorMap: Record<string, string> = {
    'red': '#e74c3c',
    'orange': '#e67e22',
    'yellow': '#f1c40f',
    'green': '#2ecc71',
    'blue': '#3498db',
    'purple': '#9b59b6',
    'white': '#ffffff',
    'black': '#000000'
  };
  
  // Case-insensitive regex to match color names with word boundaries
  const colorPattern = `\\b(${Object.keys(colorMap).join('|')})\\b`;
  
  // Replace color names with styled spans
  return text.replace(new RegExp(colorPattern, 'gi'), (match) => {
    const colorName = match.toLowerCase();
    const color = colorMap[colorName];
    const textShadow = color === '#f1c40f' || color === '#ffffff' 
      ? '0.5px 0.5px 1px rgba(0,0,0,0.5)' 
      : 'none';
    
    return `<span style="color: ${color}; font-weight: bold; text-shadow: ${textShadow}">${match}</span>`;
  });
};

/**
 * Helper function to render text with line breaks
 * @param text The text to process
 * @returns React nodes with proper line breaks
 */
const renderTextWithLineBreaks = (text: string | React.ReactNode): React.ReactNode => {
  if (typeof text !== 'string') {
    return text;
  }
  
  return text.split('\n').map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </React.Fragment>
  ));
};

/**
 * Modal component that displays tutorial information
 * 
 * This component has two modes:
 * 1. 'intro' - Shows an initial prompt asking if the user wants to start the tutorial
 * 2. 'step' - Shows instructions for the current tutorial step
 */
const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose, type = 'intro' }) => {
  const { 
    startTutorial, 
    nextStep, 
    currentStep, 
    getCurrentStepConfig,
    showColorPicker,
    endTutorial,
    demonstrationMessage
  } = useTutorialContext();
  
  // Calculate the total number of steps in the tutorial
  const totalSteps = Object.keys(TutorialStep).length / 2; // Divide by 2 because enum creates both key->value and value->key mappings
  
  // Get the current step number (starting from 1 for user-friendly display)
  const currentStepNumber = currentStep + 1;
  
  // Use the custom hook for handling click outside
  const modalRef = useModalClickOutside(onClose, isOpen);
  
  // If the modal is not open, don't render anything
  if (!isOpen) return null;
  
  // If this is a tutorial step modal, use the current step config
  if (type === 'step') {
    const { title, message } = getCurrentStepConfig();
    
    // Determine if we should show a continue button based on step
    const shouldShowContinueButton = ![
      TutorialStep.FIRST_MOVE_SELECTION,
      TutorialStep.COLOR_SELECTION,
      TutorialStep.SOLUTION_DEMONSTRATION
    ].includes(currentStep);
    
    // Position at the top when color picker is visible
    const positionClass = showColorPicker ? 'tutorial-step-modal-top' : 'tutorial-step-modal-bottom';
    
    // Add special styling for COLOR_SELECTION step to draw attention to it
    const stepSpecificClass = currentStep === TutorialStep.COLOR_SELECTION ? 'tutorial-color-selection-step' : '';
    
    // Handle continue button click
    const handleContinueClick = () => {
      debugLog('tutorialModal', `Continue button clicked for step ${TutorialStep[currentStep]}`, {
        step: currentStep,
        stepName: TutorialStep[currentStep],
        showColorPicker
      });
      
      // If we're on the winning completion step, end the tutorial
      if (currentStep === TutorialStep.WINNING_COMPLETION) {
        endTutorial();
      } else {
        nextStep();
      }
    };
    
    // Choose which message to display - use the dynamic message during solution demonstration
    const displayMessage = currentStep === TutorialStep.SOLUTION_DEMONSTRATION && demonstrationMessage 
      ? demonstrationMessage
      : message;
    
    // Process the message text with color highlighting
    const processedMessage = colorizeText(displayMessage);
    
    return (
      <div className={`tutorial-step-modal ${positionClass} ${stepSpecificClass}`}>
        <div className="tutorial-step-content" ref={modalRef}>
          <div className="tutorial-step-header">
            <h3 className="tutorial-step-title">{title}</h3>
            <span className="tutorial-step-counter">Step {currentStepNumber} of {totalSteps}</span>
          </div>
          <p 
            className="tutorial-step-message"
            dangerouslySetInnerHTML={{ __html: processedMessage }}
          />
          
          {shouldShowContinueButton && (
            <button 
              className="tutorial-continue-button"
              onClick={handleContinueClick}
            >
              {currentStep === TutorialStep.WINNING_COMPLETION ? "Play Today's Puzzle" : "Continue"}
            </button>
          )}
        </div>
      </div>
    );
  }
  
  // Default intro modal asking if user wants to start tutorial
  return (
    <div className="modal-overlay">
      <div className="modal-content" ref={modalRef}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faTimes} />
        </button>
        <div className="modal-body">
          <h2>Color Lock Tutorial</h2>
          <p>Would you like to see the Color Lock Tutorial?</p>
          <p className="tutorial-steps-info">This tutorial will take you through an example game</p>
          <div className="modal-buttons">
            <button 
              className="inverse-share-button"
              onClick={onClose}
            >
              No
            </button>
            <button 
              className="share-button"
              onClick={() => {
                startTutorial();
                onClose();
              }}
            >
              Yes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialModal; 