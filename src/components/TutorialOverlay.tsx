import React, { useEffect, useState } from 'react';
import { OverlayElement } from '../contexts/TutorialContext';
import { debugLog } from '../utils/debugUtils';

/**
 * Props for the TutorialOverlay component
 */
interface TutorialOverlayProps {
  /** Array of overlay elements to display */
  overlayElements: OverlayElement[];
}

/**
 * An overlay element with calculated position styles
 */
interface PositionedElement extends OverlayElement {
  /** CSS positioning for the element */
  positionStyle: React.CSSProperties;
  /** CSS styling for highlight boxes (only for highlight type elements) */
  highlightStyle?: React.CSSProperties;
  /** CSS styling for tooltip (only when description is provided) */
  tooltipStyle?: React.CSSProperties;
}

/**
 * Component that renders overlay elements during tutorial steps
 * 
 * This component is responsible for:
 * 1. Rendering highlights that guide the user
 * 2. Calculating the correct positioning for these elements relative to their targets
 * 3. Updating positions when the window is resized
 * 4. Displaying tooltips with descriptions when provided
 */
const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ overlayElements }) => {
  const [positionedElements, setPositionedElements] = useState<PositionedElement[]>([]);
  
  // Calculate positions for all overlay elements
  useEffect(() => {
    /**
     * Calculate positions of all overlay elements relative to their targets
     */
    const calculatePositions = () => {
      const elements: PositionedElement[] = [];
      
      overlayElements.forEach(element => {
        const targetElement = document.querySelector(element.target);
        
        if (targetElement) {
          const rect = targetElement.getBoundingClientRect();
          const style: React.CSSProperties = {};
          let highlightStyle: React.CSSProperties | undefined;
          let tooltipStyle: React.CSSProperties | undefined;
          
          // For highlight type, create a box around the target element
          if (element.type === 'highlight') {
            // Account for scroll position for fixed positioning
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;
            
            highlightStyle = {
              position: 'fixed',
              top: `${rect.top - 4}px`,
              left: `${rect.left - 4}px`,
              width: `${rect.width + 8}px`,
              height: `${rect.height + 8}px`,
              border: `3px solid ${element.color || 'red'}`,
              borderRadius: '6px',
              pointerEvents: 'none',
              zIndex: 1000,
              boxShadow: `0 0 0 2px rgba(255,255,255,0.5), 0 0 10px 2px ${element.color || 'red'}40`
            };
            
            // If description is provided, position a tooltip
            if (element.description) {
              // Calculate tooltip position based on element position parameter
              const tooltipOffset = 15; // Space between the element and tooltip
              const tooltipMargin = 10; // Additional margin for the tooltip
              
              switch (element.position) {
                case 'top':
                  tooltipStyle = {
                    position: 'fixed',
                    bottom: `${window.innerHeight - rect.top + tooltipOffset}px`,
                    left: `${rect.left + rect.width / 2}px`,
                    transform: 'translateX(-50%)',
                    maxWidth: '200px'
                  };
                  break;
                case 'bottom':
                  tooltipStyle = {
                    position: 'fixed',
                    top: `${rect.bottom + tooltipOffset}px`,
                    left: `${rect.left + rect.width / 2}px`,
                    transform: 'translateX(-50%)',
                    maxWidth: '200px'
                  };
                  break;
                case 'left':
                  tooltipStyle = {
                    position: 'fixed',
                    right: `${window.innerWidth - rect.left + tooltipOffset}px`,
                    top: `${rect.top + rect.height / 2}px`,
                    transform: 'translateY(-50%)',
                    maxWidth: '200px'
                  };
                  break;
                case 'right':
                  tooltipStyle = {
                    position: 'fixed',
                    left: `${rect.right + tooltipOffset}px`,
                    top: `${rect.top + rect.height / 2}px`,
                    transform: 'translateY(-50%)',
                    maxWidth: '200px'
                  };
                  break;
              }
              
              // Ensure tooltips aren't positioned off-screen
              const safePadding = 10; // Padding from screen edges
              
              // Create a dummy element to measure tooltip width
              const dummyEl = document.createElement('div');
              dummyEl.className = 'tutorial-tooltip-content';
              dummyEl.style.visibility = 'hidden';
              dummyEl.style.position = 'absolute';
              dummyEl.style.maxWidth = '200px';
              dummyEl.innerHTML = `<p>${element.description}</p>`;
              document.body.appendChild(dummyEl);
              
              // Get estimated dimensions
              const tooltipWidth = Math.min(200, dummyEl.offsetWidth);
              const tooltipHeight = dummyEl.offsetHeight;
              
              // Clean up dummy element
              document.body.removeChild(dummyEl);
              
              // Adjust for horizontal positioning if needed
              if (tooltipStyle.left) {
                const leftPos = parseFloat(tooltipStyle.left.toString());
                if (leftPos - (tooltipWidth / 2) < safePadding) {
                  // Too close to left edge
                  tooltipStyle.left = `${safePadding + (tooltipWidth / 2)}px`;
                } else if (leftPos + (tooltipWidth / 2) > window.innerWidth - safePadding) {
                  // Too close to right edge
                  tooltipStyle.left = `${window.innerWidth - safePadding - (tooltipWidth / 2)}px`;
                }
              }
              
              // Adjust for vertical positioning if needed
              if (tooltipStyle.top) {
                const topPos = parseFloat(tooltipStyle.top.toString());
                if (topPos < safePadding) {
                  // Too close to top edge
                  tooltipStyle.top = `${safePadding}px`;
                } else if (topPos + tooltipHeight > window.innerHeight - safePadding) {
                  // Too close to bottom edge
                  tooltipStyle.top = `${window.innerHeight - safePadding - tooltipHeight}px`;
                }
              }
            }
          }
          
          elements.push({
            ...element,
            positionStyle: style,
            highlightStyle,
            tooltipStyle
          });
        } else {
          debugLog('tutorialOverlay', `Target element not found: ${element.target}`);
        }
      });
      
      setPositionedElements(elements);
    };
    
    // Create a throttled version of calculatePositions to avoid excessive recalculations
    const throttledCalculate = (() => {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      
      return () => {
        if (!timeout) {
          timeout = setTimeout(() => {
            calculatePositions();
            timeout = null;
          }, 100);
        }
      };
    })();
    
    // Calculate positions initially
    calculatePositions();
    
    // Recalculate on window resize or scroll
    window.addEventListener('resize', throttledCalculate);
    window.addEventListener('scroll', throttledCalculate);
    
    return () => {
      window.removeEventListener('resize', throttledCalculate);
      window.removeEventListener('scroll', throttledCalculate);
    };
  }, [overlayElements]);
  
  return (
    <div className="tutorial-overlay">
      {positionedElements.map((element, index) => (
        <React.Fragment key={index}>
          {/* Render highlight box if element type is 'highlight' */}
          {element.type === 'highlight' && element.highlightStyle && (
            <div 
              className="tutorial-highlight"
              style={element.highlightStyle}
              data-color={element.color || '#333'}
            />
          )}
          
          {/* Render tooltip if element has a description */}
          {element.description && element.tooltipStyle && (
            <div 
              className="tutorial-tooltip"
              style={element.tooltipStyle}
              data-position={element.position}
              data-color={element.color || '#333'}
            >
              <div 
                className="tutorial-tooltip-content"
                style={{ 
                  borderColor: element.color || '#333',
                  backgroundColor: 'white' // Solid white background
                }}
              >
                <p>{element.description}</p>
              </div>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default TutorialOverlay; 