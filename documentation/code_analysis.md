# Color Lock Web App - Detailed Code Analysis

## Core Application Files

### src/App.tsx (Main Application Component)
- Serves as the main entry point and orchestrates the entire application UI
- Implements a nested component architecture with `GameProvider` wrapping the `GameContainer` component
- Uses React Context through the `useGameContext` hook to access all game state and functions
- Renders the game UI elements in a structured hierarchy including:
  - `GameHeader` for displaying the target color, move count, and action buttons
  - `GameGrid` for rendering the interactive color grid
  - `GameFooter` for displaying locked region information and retry options
  - Various modals (color picker, win, settings, and stats) that appear conditionally
- Manages confetti animation for win celebration using the `ReactConfetti` library
- Implements window dimension tracking for responsive confetti display
- Sets up CSS classes dynamically based on accessibility settings like high-contrast mode
- Manages loading states with placeholder UI during puzzle fetching

### src/contexts/GameContext.tsx (Core Game State & Logic)
- Creates and manages the central React Context that holds all game state
- Defines a comprehensive interface (`GameContextValue`) with ~20 state variables and ~15 functions
- Implements the following core state management:
  - Puzzle state (grid, moves, locked cells, win/lose condition)
  - UI state (modals, color picker, selected tile)
  - Game settings and statistics
  - Loading and error states
- Fetches daily puzzles from Firebase with timeout handling to prevent infinite loading
- Processes user actions:
  - Tile selection that displays the color picker
  - Color changes with validation against game rules
  - Hint requests that calculate optimal next moves
  - Retry functionality that resets the game state
- Tracks game progression:
  - Updates moves counter and evaluates win/loss conditions after each move
  - Records play time and statistics for completed games
  - Checks if player is on an optimal solution path
- Implements complex color management:
  - Adjusts colors based on user accessibility settings
  - Calculates locked region sizes and colors
  - Provides color CSS generators for UI components
- Synchronizes game state with local storage and Firebase
- Has comprehensive error handling for network failures and invalid game states

## Component Files

### src/components/GameGrid.tsx
- Renders the main 5x5 grid of colored tiles
- Takes `grid`, `lockedCells`, and `hintCell` as props to represent game state
- Uses array mapping to generate the grid rows and columns dynamically
- Applies conditional styling to locked cells and hint cells
- Implements the click handler delegation to individual tiles
- Applies accessibility settings from the context to each tile's appearance
- Uses CSS Grid for precise layout of the game board
- Integrates with the parent's `getColorCSS` function to ensure consistent color rendering

### src/components/Tile.tsx
- Renders an individual colored tile in the game grid
- Implements interactive behavior with click handlers for tile selection
- Visually differentiates between normal, locked, and hinted tiles
- Applies dynamic styling based on the tile's color and state:
  - Uses CSS variables for color values to support accessibility modes
  - Adds visual indicators for locked tiles (lock icon overlay)
  - Implements pulsing animation for hint tiles
  - Applies hover effects for interactive feedback
- Optimizes rendering with React.memo to prevent unnecessary re-renders
- Uses FontAwesome for the lock icon when a tile is locked
- Implements proper accessibility attributes for better screen reader support

### src/components/GameControls.tsx
- Contains two main components: `GameHeader` and `GameFooter`
- `GameHeader` functionality:
  - Displays game title and puzzle date
  - Shows the target color the player needs to achieve
  - Renders move counter with current and best scores
  - Provides buttons for settings, statistics, and hints
  - Implements responsive design for different screen sizes
- `GameFooter` functionality:
  - Displays information about locked regions
  - Shows color distribution in locked areas
  - Provides visual feedback on progress toward solution
  - Includes "Try Again" button for resetting the puzzle
  - Conditionally renders based on game state and settings

### src/components/ColorPickerModal.tsx
- Implements a modal dialog for selecting a new color for a tile
- Displays a grid of available colors excluding the current tile color
- Applies the same styling/accessibility adjustments as the main game
- Handles color selection through a callback to the parent component
- Provides a cancel option to dismiss the modal without making a change
- Uses a backdrop for focus and to prevent interaction with elements behind
- Implements proper keyboard navigation for accessibility
- Animates the appearance and disappearance of the modal

### src/components/WinModal.tsx
- Creates a celebratory popup when the player completes a puzzle
- Displays game statistics:
  - Moves used compared to optimal solution
  - Time taken to solve
  - Comparison to previous attempts
- Implements social sharing functionality:
  - Copy to clipboard with formatted emoji grid
  - Share to Twitter with pre-formatted text
  - Share to Facebook with game statistics
- Shows a countdown timer to the next daily puzzle
- Provides options to try again or dismiss the modal
- Includes advanced animations for celebration effects
- Uses FontAwesome icons for sharing and action buttons
- Ensures responsive layout for different device sizes

### src/components/SettingsModal.tsx
- Provides a comprehensive settings interface with multiple categories:
  - Visual settings (high contrast, animations, largest region highlight)
  - Accessibility settings (color blindness modes, font size)
  - Game settings (difficulty, sound effects)
- Implements toggle switches and radio button groups for options
- Previews color scheme changes in real-time
- Persists settings changes immediately through the settings context
- Includes reset to defaults option
- Organizes settings in collapsible sections for better UX
- Implements a modal backdrop with click-outside detection for dismissal
- Uses CSS transitions for smooth animations between setting changes

### src/components/StatsModal.tsx
- Displays comprehensive player statistics:
  - Games played, win percentage, and streaks
  - Distribution of moves across all games
  - Best scores and average performance
  - Time-based metrics (average solve time, fastest solve)
- Visualizes statistics with simple charts and graphs
- Provides sharing functionality for statistics
- Implements tabs for different statistics categories
- Uses responsive design for optimal display on various devices
- Fetches data from the game stats context and formats it for display
- Includes animations for statistics counters and graph rendering

### src/components/icons.tsx
- Defines custom SVG icons used throughout the application
- Implements a consistent interface for all icons with props for size and color
- Provides specialized game-related icons not available in standard libraries
- Ensures accessibility with proper ARIA attributes
- Optimizes SVG code for performance and file size
- Supports dynamic coloring through props and CSS variables
- Includes icons for: game controls, UI elements, and status indicators

## Utility Files

### src/utils/gameLogic.ts
- Implements core game mechanics and algorithms
- `floodFill` function:
  - Identifies connected regions of the same color using breadth-first search
  - Returns arrays of row and column indices for cells in the region
  - Handles edge cases like boundaries and visited tracking
- `findLargestRegion` function:
  - Identifies the largest contiguous color region on the board
  - Returns a Set of coordinates representing the region
  - Used for highlighting and strategic gameplay elements
- `isBoardUnified` function:
  - Checks if the entire board is a single color (win condition)
  - Uses efficient array methods for fast checking
- `generatePuzzleFromDB` function:
  - Creates a playable puzzle from Firestore data
  - Sets up initial grid, target color, and optimal solution
  - Uses seeded random generation for consistent daily puzzles
- Various helper functions for grid manipulation and state checking

### src/utils/gameUtils.ts
- Contains high-level game utility functions that build on core game logic
- `applyColorChange` function:
  - Processes a color change action on the game grid
  - Updates the grid state and locked cells
  - Returns the new game state after the change
- `checkIfOnOptimalPath` function:
  - Compares current game state against optimal solution path
  - Calculates divergence from optimal solution
  - Helps determine if player is making optimal moves
- `getGameHint` function:
  - Analyzes current board state to determine the best next move
  - Uses lookahead to avoid suggesting moves that lead to losing states
  - Returns coordinates and color for the suggested move
- `identifyLockedRegions` function:
  - Finds all regions of the target color that are locked
  - Identifies regions that cannot be changed due to surrounding colors
  - Critical for tracking game progress and win conditions
- `calculateBoardValue` function:
  - Evaluates the current board state with heuristics
  - Assigns a numerical score to the board position
  - Used for hint generation and optimal path calculation
- Additional helper functions for grid manipulation, state checking, and move validation

### src/utils/colorUtils.ts
- Manages all color-related functionality including accessibility features
- `getColorCSS` function:
  - Converts TileColor enum values to CSS color values
  - Applies color adjustments based on user settings
- `getColorBlindAdjustedColor` function:
  - Transforms colors for various color blindness types
  - Supports protanopia, deuteranopia, and tritanopia adjustments
  - Uses color theory algorithms to maintain distinguishability
- `getHighContrastColor` function:
  - Creates high-contrast alternatives for each game color
  - Ensures WCAG compliance for accessibility
- `getLockedColorCSS` function:
  - Generates CSS for locked regions with visual distinction
  - Applies appropriate accessibility adjustments
- `getLockedSquaresColor` function:
  - Analyzes locked cells to determine dominant colors
  - Returns distribution of colors in locked regions
- Color mapping utilities for various output formats (HEX, RGB, HSL)
- Color conversion functions between different color spaces

### src/utils/hintUtils.ts
- Implements sophisticated algorithms for generating hints and analyzing game state
- `_floodFillSimple` and `_floodFillStatic` functions:
  - Specialized flood fill implementations for hint generation
  - Matches Python implementation for consistency with backend algorithms
- `getValidActions` function:
  - Identifies all legal moves from current game state
  - Filters out moves that would violate game rules
- `computeActionDifference` function:
  - Evaluates how a potential move changes the board state
  - Calculates a numerical score for each possible move
  - Identifies moves that would lead to losing states (returns -999999)
- `getHint` function:
  - Main hint generation function that combines all hint algorithms
  - Uses lookahead to find moves that lead toward optimal solution
  - Returns coordinates and color for best next move
  - Includes validity checking and optimization
- `boardToString` and `stringToBoard` functions:
  - Convert between grid representation and string format
  - Used for state comparison and storage optimization
- Advanced board evaluation functions with weighted scoring
- Implements minimax-like algorithm for move evaluation with limited depth

### src/utils/shareUtils.ts
- Handles all functionality related to sharing game results
- `tileColorToName` and `tileColorToEmoji` functions:
  - Convert tile colors to human-readable names and emoji representations
  - Used in share text generation
- `generateShareText` function:
  - Creates formatted text for sharing game results
  - Includes emoji grid representation, score, and date
  - Builds different formats for different sharing platforms
- `copyToClipboard` function:
  - Uses modern clipboard API with fallbacks
  - Handles browser compatibility issues
  - Returns success/failure for UI feedback
- Platform-specific sharing functions:
  - `shareToTwitter`
  - `shareToFacebook`
  - `shareViaEmail`
- Implements Web Share API integration with fallbacks
- Generates shareable links with game state encoded in URL parameters
- Handles URL shortening for platforms with character limits

### src/utils/storageUtils.ts
- Manages all local storage operations for game persistence
- `loadDailyPuzzleIfExists` function:
  - Retrieves saved puzzle data for the current day
  - Handles format conversion and validation
  - Returns null if no saved puzzle exists
- `saveDailyPuzzle` function:
  - Persists current puzzle state to localStorage
  - Implements versioning for future compatibility
  - Handles storage limit issues
- `clearOldPuzzles` function:
  - Removes puzzles older than a certain timeframe
  - Prevents localStorage from filling up over time
- `loadGameStats` and `saveGameStats` functions:
  - Manage player statistics persistence
  - Handle data migration from older versions
- `loadSettings` and `saveSettings` functions:
  - Persist user preferences and settings
  - Apply defaults for missing settings
- Implements error handling for storage failures
- Uses compression for efficient storage utilization

### src/utils/dateUtils.ts
- Handles all date-related functionality for daily puzzles
- `dateKeyForToday` function:
  - Generates a standardized string representation of today's date
  - Used as a key for daily puzzle lookup
- `formatDateForDisplay` function:
  - Creates human-readable date format for UI
  - Supports localization options
- `stableSeedForDate` function:
  - Generates a deterministic seed from a date string
  - Critical for ensuring consistent puzzle generation
- `createSwiftSeededGenerator` function:
  - Implements a seeded random number generator
  - Ensures consistent puzzle generation across devices
  - Compatible with backend random generation algorithms
- `calculateTimeUntilTomorrow` function:
  - Computes milliseconds until next day's puzzle
  - Used for countdown timer in win modal
- `formatTimeRemaining` function:
  - Converts milliseconds to human-readable time format
  - Used in countdown display

## Type Definition Files

### src/types/index.ts
- Defines core type structures used throughout the application
- `TileColor` enum:
  - Defines the six possible colors (red, green, blue, yellow, purple, orange)
  - Used for type safety when manipulating colors
- `allColors` constant array for iteration over all possible colors
- `DailyPuzzle` interface:
  - Comprehensive type definition for puzzle state
  - Includes grid, user progress, locked cells, target color
  - Tracks statistics like moves used and best score
- `PuzzleGrid` interface:
  - Type for grid representation with row indices and color arrays
  - Used for serialization and storage
- `FirestorePuzzleData` interface:
  - Defines the structure of puzzle data from Firebase
  - Includes optimal solution path and algorithm score
  - Contains states array for tracking solution progression

### src/types/settings.ts
- Defines types for the application's settings system
- `ColorBlindMode` enum:
  - Specifies different color blindness types (protanopia, deuteranopia, tritanopia)
  - Used for applying appropriate color adjustments
- `AppSettings` interface:
  - Comprehensive definition of all user configurable settings
  - Visual settings (high contrast, animations)
  - Accessibility settings (color blindness mode, font size)
  - Gameplay settings (difficulty, sound effects)
- `defaultSettings` constant:
  - Defines initial values for all settings
  - Used when no user settings are stored
- Additional helper types for settings groups and individual setting options
- Type guards for settings validation

### src/types/stats.ts
- Defines types for game statistics tracking
- `GameStatistics` interface:
  - Comprehensive definition of player performance metrics
  - Tracks games played, wins, losses, and streaks
  - Records move distributions and time-based metrics
  - Stores best scores and performance history
- `DailyStats` interface:
  - Records statistics for individual daily puzzles
  - Allows for historical comparison
- `MoveDistribution` interface:
  - Tracks frequency of different move counts
  - Used for statistical visualization
- `defaultStats` constant:
  - Initializes statistics structure with zero values
  - Used for new players or when stats are reset
- Supporting types for statistical analysis and visualization

## Service Files

### src/services/firebaseService.ts
- Implements Firebase integration for backend functionality
- `fetchPuzzleFromFirestore` function:
  - Retrieves daily puzzle data from Firestore database
  - Handles authentication and error cases
  - Implements caching to reduce database reads
- `savePuzzleResult` function:
  - Records player results for completed puzzles
  - Uploads anonymized play data for analysis
- `checkPuzzleExists` function:
  - Verifies if a puzzle exists for a specific date
  - Used for fallback to offline play when no puzzle exists
- `syncUserStats` function:
  - Synchronizes local statistics with cloud storage
  - Handles conflict resolution between local and server data
- `listenForPuzzleUpdates` function:
  - Sets up real-time listeners for puzzle updates
  - Enables dynamic puzzle corrections or updates
- Implements Firebase App Check for security
- Includes comprehensive error handling and retry logic
- Uses batched writes for better performance and atomicity

### src/firebase_config.tsx
- Contains Firebase configuration and initialization
- Defines Firebase project settings:
  - API keys and project identifiers
  - Database URLs and region settings
- Sets up Firebase services:
  - Firestore for puzzle data
  - Analytics for usage tracking
  - Authentication for optional user accounts
- Configures security rules and restrictions
- Implements environment-specific configuration
- Sets up Firebase App Check with reCAPTCHA v3

## Hook Files

### src/hooks/useSettings.ts
- Custom React hook for managing user settings
- `useSettings` hook functions:
  - Loads initial settings from localStorage on mount
  - Provides methods to update individual settings
  - Persists changes to localStorage automatically
  - Returns current settings and update methods
- Implements settings validation and type safety
- Uses React's state and effect hooks for proper lifecycle management
- Includes defaulting logic for missing settings
- Handles settings version migration for future compatibility
- Implements context-based updates for efficiency

### src/hooks/useGameStats.ts
- Custom React hook for tracking and persisting game statistics
- `useGameStats` hook functions:
  - Loads existing statistics from localStorage
  - Provides methods to update statistics after games
  - Calculates derived statistics (win percentage, average moves)
  - Persists statistics changes automatically
- Implements comprehensive statistics tracking:
  - Games played, wins, and losses
  - Best scores and average performance
  - Streaks and historical performance
  - Time-based metrics
- Handles data migration from older versions
- Uses efficient update patterns to prevent unnecessary re-renders
- Includes methods for statistics reset and export 