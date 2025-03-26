import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { useTutorialContext, TutorialStep } from '../contexts/TutorialContext';
import { useModalClickOutside } from '../utils/modalUtils';
import { debugLog, LogLevel } from '../utils/debugUtils';

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
    endTutorial
  } = useTutorialContext();
  
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
      TutorialStep.COLOR_SELECTION
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
    
    return (
      <div className={`tutorial-step-modal ${positionClass} ${stepSpecificClass}`}>
        <div className="tutorial-step-content" ref={modalRef}>
          <h3 className="tutorial-step-title">{title}</h3>
          <p className="tutorial-step-message">{message}</p>
          
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