# Color Lock - Developer Documentation

## Table of Contents

1.  [Introduction](#introduction)
2.  [Project Structure](#project-structure)
    *   [Frontend (`src/`)](#frontend-src)
    *   [Backend (`functions/`)](#backend-functions)
    *   [Scripts (`scripts/`)](#scripts-scripts)
    *   [Configuration Files](#configuration-files)
3.  [Core Concepts & Architecture](#core-concepts--architecture)
    *   [Frontend (React + TypeScript + Vite)](#frontend-react--typescript--vite)
    *   [State Management (React Context API)](#state-management-react-context-api)
    *   [Backend (Firebase Functions)](#backend-firebase-functions)
    *   [Database (Firestore)](#database-firestore)
4.  [Data Flow](#data-flow)
    *   [Game Initialization](#game-initialization)
    *   [User Actions (Making a Move)](#user-actions-making-a-move)
    *   [Updating Statistics](#updating-statistics)
    *   [Fetching Global Stats](#fetching-global-stats)
    *   [Authentication](#authentication)
5.  [Key Features & Modules](#key-features--modules)
    *   [Game Logic](#game-logic)
    *   [Statistics System](#statistics-system)
    *   [Authentication](#authentication-1)
    *   [Tutorial System](#tutorial-system)
    *   [Settings](#settings)
    *   [Firebase Services](#firebase-services)
6.  [Local Development Setup](#local-development-setup)
    *   [Prerequisites](#prerequisites)
    *   [Installation](#installation)
    *   [Environment Variables](#environment-variables)
    *   [Running Firebase Emulators](#running-firebase-emulators)
    *   [Running the Frontend](#running-the-frontend)
    *   [Emulator UI](#emulator-ui)
7.  [Testing](#testing)
    *   [Unit & Integration Tests](#unit--integration-tests)
    *   [Emulator Testing](#emulator-testing)
    *   [Debugging Firebase Functions](#debugging-firebase-functions)
8.  [Deployment](#deployment)
    *   [Frontend (Netlify)](#frontend-netlify)
    *   [Backend (Firebase Functions)](#backend-firebase-functions-1)
9.  [Contributing Guide](#contributing-guide)
    *   [Code Style](#code-style)
    *   [Branching](#branching)
    *   [Pull Requests](#pull-requests)
10. [Troubleshooting](#troubleshooting)

---

## 1. Introduction

Color Lock is a daily puzzle game where the objective is to make the entire game grid a single target color by strategically changing tile colors. This document provides an overview of the codebase for developers looking to understand, maintain, or contribute to the project.

The application consists of:

*   A **React frontend** built with TypeScript and Vite.
*   A **Firebase backend** using Cloud Functions (TypeScript) for game logic access, statistics updates, and data validation.
*   **Firestore** as the database for storing puzzles, user statistics, and daily scores.
*   **Firebase Authentication** for user management (including guest access).

---

## 2. Project Structure

The repository is organized into several key directories:

### Frontend (`src/`)

*   **`App.tsx`**: The main application component, orchestrating providers and routing (simplified).
*   **`index.tsx`**: Entry point for the React application.
*   **`components/`**: Contains reusable UI components (e.g., `GameGrid.tsx`, `WinModal.tsx`, `SettingsModal.tsx`, `LandingScreen.tsx`, `SignInScreen.tsx`).
*   **`contexts/`**: Holds React Context providers for managing global state:
    *   `AuthContext.tsx`: Manages user authentication state (logged in, guest, etc.).
    *   `GameContext.tsx`: Manages the core game state (puzzle data, user moves, loading, errors, modals).
    *   `TutorialContext.tsx`: Manages the state and logic for the interactive tutorial.
    *   `NavigationContext` (in `App.tsx`): Manages navigation between the landing screen and the game screen.
    *   `SettingsContext` (in `App.tsx`): Provides settings state (though primarily managed via `useSettings` hook).
*   **`hooks/`**: Contains custom React hooks:
    *   `useSettings.ts`: Manages application settings and persistence.
    *   `useGameStats.ts`: Manages game statistics and persistence (currently local storage based, interacts with Firestore via `GameContext`).
*   **`services/`**: Handles interactions with external services:
    *   `firebaseService.ts`: Initializes Firebase services (Auth, Firestore, Functions) and handles connections, including emulator setup.
    *   `firebaseDebug.ts`: Utility functions for debugging Firebase connections in the browser console.
*   **`types/`**: Contains TypeScript type definitions:
    *   `index.ts`: Core game types (`TileColor`, `DailyPuzzle`, `FirestorePuzzleData`).
    *   `settings.ts`: Types related to application settings (`AppSettings`, `ColorBlindMode`, etc.).
    *   `stats.ts`: Types related to game statistics (`GameStatistics`).
*   **`utils/`**: Contains utility functions for various tasks:
    *   `gameLogic.ts`: Core game algorithms (flood fill, finding largest region).
    *   `gameUtils.ts`: Helper functions for game actions (applying moves, checking optimal path, getting hints).
    *   `colorUtils.ts`: Functions for handling color display based on settings.
    *   `dateUtils.ts`: Functions for handling dates and seeding RNG.
    *   `hintUtils.ts`: Functions specifically for hint generation logic.
    *   `shareUtils.ts`: Functions for generating share text and handling social sharing.
    *   `storageUtils.ts`: Functions for saving/loading data (settings, stats, puzzle state) to/from local storage.
    *   `tutorialUtils.ts`: Helper functions for the tutorial system.
    *   `autocompleteUtils.ts`: Logic for the auto-complete feature.
    *   `modalUtils.ts`: Hooks or utilities related to modal behavior (like click outside).
    *   `debugUtils.ts`: Standardized logging utilities.
*   **`scss/`**: Contains SCSS stylesheets organized using a modular structure (abstracts, base, components, layout, modals).
    *   `main.scss`: Main entry point for styles.
*   **`env/`**: Contains environment-specific configurations.
    *   `firebaseConfig.tsx`: Loads Firebase configuration from environment variables.

### Backend (`functions/`)

*   **`src/index.ts`**: Main entry point for Firebase Cloud Functions. Defines HTTP and Callable functions.
*   **`package.json`**: Node.js dependencies and scripts for the functions.
*   **`tsconfig.json`**: TypeScript configuration for the functions.
*   **`.runtimeconfig.json`**: Local configuration override for functions (e.g., allowed origins for CORS).
*   **`.eslintrc.js`**: ESLint configuration for code linting.

### Scripts (`scripts/`)

*   **`seed-emulator.js`**: Seeds the Firestore emulator with sample puzzle and score data for local testing.
*   **`cursor-emulator.sh`**: Enhanced script to start Firebase emulators, kill conflicting processes, and seed data (recommended for local dev).
*   **`run-local-test.sh`**: Basic script to start emulators and seed data.
*   **`debug-function.sh`**: Script to assist in debugging Cloud Functions locally.
*   **`trigger-daily-scores-stats.js`**: Helper script used by `debug-function.sh` to invoke a specific function.

### Configuration Files

*   **`firebase.json`**: Configures Firebase services (Firestore rules, Functions deployment, Emulators).
*   **`.firebaserc`**: Associates the project directory with a Firebase project (`color-lock-prod`).
*   **`firestore.rules`**: Security rules for the Firestore database.
*   **`firestore.indexes.json`**: Firestore index definitions (currently empty).
*   **`netlify.toml`**: Configuration for deploying the frontend to Netlify.
*   **`package.json`**: Root project dependencies and scripts.
*   **`vite.config.mjs`**: Configuration for the Vite build tool and development server.
*   **`nx.json`**: Configuration for the Nx build system (manages tasks like build, serve, test).
*   **`EMULATOR_TESTING.md`**: Guide specifically for setting up and testing with Firebase emulators.
*   **`prompts/userStats_descriptions.txt`**: Descriptions of the fields used in the `userStats` Firestore collection.

---

## 3. Core Concepts & Architecture

### Frontend (React + TypeScript + Vite)

*   **UI Library:** React functional components with Hooks.
*   **Language:** TypeScript for static typing and improved developer experience.
*   **Build Tool:** Vite provides a fast development server and optimized production builds.
*   **Styling:** SCSS with a modular structure (`src/scss/`).
*   **Routing:** Simplified routing managed by `App.tsx` and `NavigationContext` to switch between the landing screen and the main game view.

### State Management (React Context API)

Global state is managed primarily through React's Context API. Key contexts include:

*   **`AuthContext`**: Handles user authentication state (logged in, guest status, user object) and provides functions for sign-in, sign-up, sign-out, and playing as a guest.
*   **`GameContext`**: The central hub for game-related state. It manages the current `puzzle` object, `settings`, loading/error states, hint information, modal visibility (`showWinModal`, `showSettings`, etc.), and provides core game interaction functions (`handleTileClick`, `handleColorSelect`, `handleTryAgain`, `handleHint`, `handleAutoComplete`). It also interacts with Firebase Functions via `callUpdateStats`.
*   **`TutorialContext`**: Manages the state specific to the interactive tutorial, including the current step, tutorial board state, user interactions within the tutorial, and demonstration logic.
*   **`NavigationContext`**: Simple context (defined in `App.tsx`) to toggle between the `LandingScreen` and the main `GameContainer`.
*   **`SettingsContext`**: (Defined in `App.tsx`, state managed by `useSettings` hook) Holds the current application settings affecting visuals, accessibility, and game difficulty.

### Backend (Firebase Functions)

Cloud Functions provide a secure API layer between the frontend and Firestore. They handle operations that require elevated privileges or complex server-side logic.

*   **`fetchPuzzle` (HTTP Request):** Securely fetches the daily puzzle data for a given date from Firestore. Requires authentication (Firebase Auth token or emulator bypass header). Handles CORS and origin validation.
*   **`updateUserStats` (Callable):** Updates user statistics in Firestore (`userStats` collection) and records the user's score for the day in the `dailyScores` subcollection. Triggered after game completion, loss, or try again. Uses Firestore transactions for atomic updates.
*   **`getDailyScoresStats` (Callable):** Calculates and returns aggregate statistics (lowest score, average score, total players, etc.) for a specific puzzle date by querying the `dailyScores` subcollection. Used by the `LandingScreen`.

### Database (Firestore)

Firestore is used to store persistent data:

*   **`puzzles/{date}`**: Stores the daily puzzle configuration, including the initial grid state (`states[0]`), target color, algorithm score (`algoScore`), and the sequence of optimal moves (`actions`). *Client access is blocked by rules; accessed only via `fetchPuzzle` function.*
*   **`userStats/{userId}`**: Stores individual user statistics (streaks, games played, best scores per day, hints used, etc.). *Accessible only by the authenticated user.* See `prompts/userStats_descriptions.txt` for field details.
*   **`dailyScores/{date}/scores/{userId}`**: Stores the best score achieved by each user for a specific puzzle date. This structure allows efficient querying for daily leaderboards or global stats. *Client access is blocked by rules; written by `updateUserStats` function, read by `getDailyScoresStats` function.*
*   **`users/{userId}`**: (Optional, based on rules) Could store general user profile information separate from stats.

---

## 4. Data Flow

Understanding how data moves through the application is key:

1.  **Game Initialization:**
    *   `App.tsx` mounts -> `AuthProvider` checks auth state.
    *   If authenticated (or guest mode initiated), `GameProvider` mounts.
    *   `GameProvider`'s `useEffect` calls `fetchPuzzle` (in `firebaseService.ts`).
    *   `fetchPuzzle` ensures authentication (signing in anonymously if needed) and calls the `fetchPuzzle` Cloud Function (HTTP).
    *   The Cloud Function validates the request (auth, origin) and reads the puzzle data from `puzzles/{date}` in Firestore.
    *   The function returns the puzzle data to the frontend.
    *   `GameProvider` receives the data, uses `generatePuzzleFromDB` to create the initial `DailyPuzzle` state object (adjusting `algoScore` based on difficulty settings), finds the initial `lockedCells`, and updates its state.
    *   `GameContainer` and child components re-render with the puzzle data.

2.  **User Actions (Making a Move):**
    *   User clicks a non-locked tile -> `GameGrid` -> `Tile` -> `onTileClick` prop.
    *   `GameContext.handleTileClick` is called, setting `selectedTile` and showing the `ColorPickerModal`.
    *   User clicks a color in the modal -> `ColorPickerModal.onSelect`.
    *   `GameContext.handleColorSelect` is called:
        *   If it's the first move, calls `callUpdateStats` to trigger the `updateUserStats` function with `eventType: 'firstMove'`.
        *   Calls `applyColorChange` (in `gameUtils.ts`) which uses `floodFill` (in `gameLogic.ts`) to update the grid state.
        *   Updates the `puzzle` state (grid, moves used, checks for win/loss).
        *   Calls `checkIfOnOptimalPath` to update `isOnOptimalPath`.
        *   Checks `shouldShowAutocomplete` and potentially shows the `AutocompleteModal`.
        *   If solved, calls `handlePuzzleSolved`.
        *   Closes the color picker.
    *   Components re-render based on the updated `puzzle` state.

3.  **Updating Statistics:**
    *   **Win/Loss/Try Again/Hint/First Move:** `GameContext` calls `callUpdateStats` with relevant event data (score, moves, hints, puzzleId, etc.).
    *   `callUpdateStats` invokes the `updateUserStats` Firebase Function (Callable).
    *   The Cloud Function reads the user's current stats from `userStats/{userId}` within a transaction.
    *   It calculates updated stats based on the event type and the descriptions in `prompts/userStats_descriptions.txt`.
    *   If the event involves a score (win or try again with a score), it also updates/sets the score in `dailyScores/{puzzleId}/scores/{userId}` (only if the new score is better).
    *   The function writes the updated stats back to `userStats/{userId}` atomically via the transaction.
    *   *(Note: The frontend stats state managed by `useGameStats` is currently separate and uses local storage. It should ideally be synchronized with Firestore data, potentially by having `updateUserStats` return the updated stats or by refetching after updates).*

4.  **Fetching Global Stats (Landing Screen):**
    *   `LandingScreen` mounts -> `useEffect` triggers `fetchDailyScoresStats`.
    *   This calls the `getDailyScoresStats` Firebase Function (Callable) with today's date as `puzzleId`.
    *   The Cloud Function queries all documents in the `dailyScores/{today}/scores` subcollection.
    *   It calculates the lowest score, average score, total players, and players with the lowest score.
    *   The function returns these stats to the `LandingScreen`.
    *   `LandingScreen` updates its state and displays the global stats.

5.  **Authentication:**
    *   User interacts with `SignInScreen` or `SignUpButton` or clicks "Play as Guest" on `LandingScreen`.
    *   These components call functions from `useAuth()` (`signIn`, `signUp`, `playAsGuest`, `logOut`).
    *   `AuthContext` interacts directly with Firebase Authentication (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `signInAnonymously`, `signOut`).
    *   `onAuthStateChanged` listener in `AuthContext` updates `currentUser`, `isGuest`, `isAuthenticated`, and `isLoading` state.
    *   Components consuming `AuthContext` (like `App.tsx`, `SignUpButton`) re-render based on auth state changes.
    *   `AuthContext` also manages `localStorage` for the `authPreference` ('guest' or 'user').

---

## 5. Key Features & Modules

*   **Game Logic (`gameLogic.ts`, `gameUtils.ts`):** Handles core mechanics like flood fill for color changes, identifying the largest connected region (`lockedCells`), checking win/loss conditions, applying moves, and providing hints based on the optimal path or dynamic calculation.
*   **Statistics System (`stats.ts`, `useGameStats.ts`, `storageUtils.ts`, `functions/src/index.ts#updateUserStats`):** Tracks various player metrics both locally (for immediate display) and persistently in Firestore (`userStats`, `dailyScores`). The `updateUserStats` function is the central point for backend stat updates.
*   **Authentication (`AuthContext.tsx`, `SignInScreen.tsx`, `SignUpButton.tsx`):** Manages user sign-in, sign-up, guest access, and sign-out using Firebase Auth.
*   **Tutorial System (`TutorialContext.tsx`, `tutorialConfig.ts`, `tutorialUtils.ts`, `Tutorial*.tsx` components):** Provides an interactive step-by-step guide for new players, using a predefined puzzle and solution path. Manages highlighting, overlays, and user interaction validation during the tutorial.
*   **Settings (`settings.ts`, `useSettings.ts`, `SettingsModal.tsx`, `colorUtils.ts`):** Allows users to customize accessibility (high contrast, color blindness modes) and visual/gameplay options (animations, sound, difficulty). Settings are persisted in local storage.
*   **Firebase Services (`firebaseService.ts`, `firebaseConfig.tsx`):** Initializes and exports Firebase instances, handles emulator connections, and provides core interaction functions like `fetchPuzzle`.

---

## 6. Local Development Setup

### Prerequisites

*   **Node.js:** Version 22 (as specified in `functions/package.json`). Use a version manager like `nvm` if needed.
*   **npm** or **yarn:** Package manager.
*   **Firebase CLI:** Install globally: `npm install -g firebase-tools`. Log in using `firebase login`.

### Installation

1.  Clone the repository.
2.  Install root dependencies: `npm install` (or `yarn`)
3.  Install functions dependencies: `cd functions && npm install && cd ..`

### Environment Variables

The Firebase configuration is loaded from environment variables prefixed with `VITE_`.

1.  Create a `.env` file in the project root.
2.  Copy the contents of your Firebase project's web configuration (Firebase Console -> Project Settings -> General -> Your apps -> Web app -> SDK setup and configuration -> Config) into the `.env` file, prefixing each key with `VITE_`.

    *Example `.env` file:*
    ```dotenv
    VITE_FIREBASE_API_KEY=AIz...
    VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=your-project-id
    VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
    VITE_FIREBASE_MESSAGING_SENDER_ID=...
    VITE_FIREBASE_APP_ID=1:...:web:...
    VITE_FIREBASE_MEASUREMENT_ID=G-...
    ```

### Running Firebase Emulators

The emulators allow you to run Firebase services (Auth, Firestore, Functions) locally.

**Recommended Method:**

Use the custom script which handles cleanup and seeding automatically:

```bash
npm run cursor-dev

This script will:

1.  Attempt to kill processes using common emulator ports (8080, 9099, 5001, etc.).
2.  Start the Auth, Firestore, and Functions emulators for the `color-lock-prod` project.
3.  Wait for emulators to initialize.
4.  Run `scripts/seed-emulator.js` to populate Firestore with test data (a puzzle for today and sample scores).
5.  Keep the emulators running.

**Alternative Method:**

```bash
npm run local-test
Use code with caution.
Markdown
This performs similar steps but without the aggressive port cleanup.

Manual Method:

Start emulators:

firebase emulators:start --only auth,firestore,functions --project color-lock-prod
Use code with caution.
Bash
In a separate terminal, seed data:

node scripts/seed-emulator.js
Use code with caution.
Bash
Running the Frontend
In a separate terminal from the emulators:

npm run dev
Use code with caution.
Bash
This starts the Vite development server, typically on http://localhost:3000. The app will automatically connect to the running emulators because useEmulators in firebaseService.ts is true in development mode.

Emulator UI
You can inspect the state of the emulators via the Emulator UI: http://localhost:4000. This is useful for viewing Firestore data, Auth users, and Functions logs.

7. Testing
Unit & Integration Tests
The project is set up with Vitest (vitest.config.mjs, package.json).

Basic configuration is in src/setupTests.ts.

Currently, only a placeholder test (App.test.tsx) exists.

To run tests: npm test

Recommendation: Add more tests using Vitest and @testing-library/react for components, hooks, and utility functions. Mock Firebase interactions where necessary.

Emulator Testing
This is the primary way to test the full application flow locally.

Use the npm run cursor-dev script to ensure a clean environment and seeded data.

Manually interact with the application in the browser.

Use the Emulator UI (localhost:4000) to verify data changes in Firestore (userStats, dailyScores) and check Functions logs for errors.

Refer to EMULATOR_TESTING.md for more detailed emulator guidance and troubleshooting.

Use the browser console debugging tools exposed in firebaseDebug.ts (e.g., window.testFirebase.logConnectionInfo(), window.testFirebase.checkDocument(...), window.testFirebase.testFunction(...)).

Debugging Firebase Functions
Use the scripts/debug-function.sh script (ensure it's executable: chmod +x scripts/debug-function.sh).

Run: ./scripts/debug-function.sh

Follow the script's prompts to attach your debugger (e.g., VS Code debugger configured for Node.js attach on port 9229).

The script will trigger the getDailyScoresStats function, allowing you to step through the code in functions/src/index.ts.

8. Deployment
Frontend (Netlify)
The netlify.toml file configures the build process for Netlify.

Build Command: npm run build

Publish Directory: dist/color-lock-web

Environment Variables: Ensure your Firebase configuration variables (prefixed with VITE_) are set in the Netlify build environment settings.

The redirect rule /* /index.html 200 handles client-side routing for the SPA.

Backend (Firebase Functions)
Login: Ensure you are logged into the Firebase CLI: firebase login.

Select Project: Make sure the correct Firebase project (color-lock-prod) is selected: firebase use color-lock-prod.

Compile: Build the TypeScript functions: cd functions && npm run build && cd ..

Deploy: Deploy only the functions: firebase deploy --only functions

9. Contributing Guide
Code Style
Follow standard TypeScript and React best practices.

Run the linter for the functions: cd functions && npm run lint && cd ..

(Consider adding Prettier and ESLint configuration for the frontend for consistency).

Branching
Use feature branches based off the main branch (e.g., main or master).

Name branches descriptively (e.g., feat/add-new-modal, fix/stats-calculation-bug).

Pull Requests
Ensure code builds (npm run build in root and functions) and tests pass (if applicable).

Provide a clear description of the changes made.

Link to any relevant issues.

Request reviews from other team members.

10. Troubleshooting
Emulator Port Conflicts: Use npm run cursor-dev or manually kill processes using ports 8080, 9099, 5001, 4000 (see EMULATOR_TESTING.md).

Frontend Not Connecting to Emulators:

Verify emulators are running (localhost:4000).

Check browser console for "Connecting to Firebase emulators" message from firebaseService.ts.

Ensure useEmulators is true in firebaseService.ts (should be automatic in dev mode).

Hard refresh the browser (Cmd+Shift+R or Ctrl+Shift+R).

Data Not Seeding:

Check the output of the npm run cursor-dev or npm run seed command for errors.

Verify the Firestore emulator is running before seeding.

Check the Firestore rules (firestore.rules) - although seeding bypasses rules, ensure they are not causing unexpected issues later.

Firebase Function Errors:

Check the Functions logs in the Emulator UI (localhost:4000/functions).

Use the debugging script (./scripts/debug-function.sh) to step through the code.

Ensure .runtimeconfig.json is correctly configured for local CORS if needed.

Authentication Issues:

Verify Firebase Auth emulator is running.

Check Firebase project configuration in .env is correct.

Look for specific error messages in the browser console or AuthContext logs.

Missing Environment Variables: Ensure the .env file is correctly set up in the project root with all necessary VITE_FIREBASE_ variables.