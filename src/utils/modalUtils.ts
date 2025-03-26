import React, { useEffect, useRef } from 'react';

/**
 * Custom hook to handle modal click-outside behavior
 * @param onClose Function to call when clicking outside the modal
 * @param isOpen Boolean indicating if the modal is open
 * @returns A ref to attach to the modal content
 */
export const useModalClickOutside = (
  onClose: () => void,
  isOpen: boolean
): React.RefObject<HTMLDivElement> => {
  const modalRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);
  
  return modalRef;
}; 