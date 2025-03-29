import React from 'react';

interface LockIconProps {
  size?: number;
}

// Minimal white lock icon used in the grid
export const MinimalWhiteLock: React.FC<LockIconProps> = ({ size = 14 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 14 14" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className="lock-icon"
  >
    {/* Thinner shackle */}
    <path 
      d="M5 7V5.5C5 4.6 6.3 4 7 4C7.7 4 9 4.6 9 5.5V7" 
      stroke="white" 
      strokeWidth="1.2" 
      strokeLinecap="round"
    />
    
    {/* Thinner lock body */}
    <rect x="4" y="7" width="6" height="5" fill="white" rx="0.8" />
  </svg>
);

// Larger, more detailed lock icon for the landing page - tall black version
export const LandingPageLock: React.FC<LockIconProps> = ({ size = 64 }) => (
  <svg 
    width={size} 
    height={Math.floor(size * 1.2)} 
    viewBox="0 0 64 76" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className="landing-lock-icon"
  >
    {/* Taller shackle */}
    <path 
      d="M18 36V18C18 12 24 6 32 6C40 6 46 12 46 18V36" 
      stroke="#000000" 
      strokeWidth="4" 
      strokeLinecap="round"
    />
    
    {/* Lock body */}
    <rect x="12" y="36" width="40" height="32" rx="4" fill="#000000" />
    
    {/* Keyhole */}
    <circle cx="32" cy="52" r="4" fill="white" />
    <rect x="30" y="56" width="4" height="6" fill="white" />
  </svg>
); 