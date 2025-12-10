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
    *   [Backend (Firebase Functions with App Check)](#backend-firebase-functions-with-app-check)
    *   [Database (Firestore)](#database-firestore)
4.  [Data Flow](#data-flow)
    *   [Game Initialization (using Callable Functions)](#game-initialization-using-callable-functions)
    *   [User Actions (Making a Move)](#user-actions-making-a-move)
    *   [Updating Statistics (using Callable Functions)](#updating-statistics-using-callable-functions)
    *   [Fetching Global Stats (using Callable Functions)](#fetching-global-stats-using-callable-functions)
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
    *   [Emulator Testing (Functions)](#emulator-testing-functions)
    *   [Debugging Firebase Functions](#debugging-firebase-functions)
8.  [Deployment](#deployment)
    *   [Frontend (Netlify)](#frontend-netlify)
    *   [Backend (Firebase Functions)](#backend-firebase-functions-1)
    *   [App Check Setup](#app-check-setup)
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
*   **Firebase App Check** to verify that requests are coming from your authentic application.

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
    *   `firebaseService.ts`: Initializes Firebase services (Auth, Firestore, Functions, App Check) and handles connections, including emulator setup.
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

*   **`src/index.ts`**: Main entry point for Firebase Cloud Functions. Defines callable functions with App Check and Auth verification.
*   **`package.json`**: Node.js dependencies and scripts for the functions.
*   **`tsconfig.json`**: TypeScript configuration for the functions.
*   **`.runtimeconfig.json`**: Local configuration override for functions.
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

### Backend (Firebase Functions with App Check)

The backend logic resides in Firebase Cloud Functions, which provide secure, scalable backend functionality. The security architecture is multi-layered:

1. **Firebase App Check**: Verifies that requests are coming from your authentic application (using reCAPTCHA v3).
   - Prevents unauthorized scripts, applications, or bots from accessing your backend functions.
   - Blocks requests not originating from your registered app instances.
   - The Firebase SDK handles the reCAPTCHA v3 integration automatically.

2. **Firebase Authentication**: Verifies user identity.
   - All functions that modify user data require authentication.
   - Some functions (like `fetchPuzzleV2`) allow guest/unauthenticated access.

3. **Callable Functions**: Used instead of HTTP endpoints.
   - Automatically handle CORS, token management, and serialization.
   - Provide type safety between client and server via TypeScript.
   - Include context parameters with verification status (App Check, Auth).

This architecture ensures:
- Only legitimate instances of your application can access your backend.
- User data is protected by authentication checks.
- The communication between frontend and backend is secure and typed.

*Relevant Files:* `functions/src/index.ts`, `src/services/firebaseService.ts`

### Database (Firestore)

Firestore is used to store persistent data:

*   **`puzzles/{date}`**: Stores the legacy daily puzzle configuration, including the initial grid state (`states[0]`), target color, algorithm score (`algoScore`), and the sequence of optimal moves (`actions`). *Client access is blocked by rules; accessed only via the deprecated `fetchPuzzle` function.*
*   **`puzzlesV2/{date}-{difficulty}`**: Stores the per-difficulty puzzle configuration returned by `fetchPuzzleV2` (fields: `states`, `actions`, `targetColor`, `algoScore`, `colorMap`). *Client access is blocked by rules; accessed via `fetchPuzzleV2`.*
*   **`userStats/{userId}`**: Stores individual user statistics directly at the root level (e.g., `currentPuzzleCompletedStreak`, `totalWins`, `bestScoresByDay`, `eloScoreByDay`, etc.). *Accessible only by the authenticated user.* See `src/types/stats.ts` for the full `GameStatistics` structure.
*   **`dailyScores/{date}/scores/{userId}`**: Stores the best score achieved by each user for a specific puzzle date. This structure allows efficient querying for daily leaderboards or global stats. *Client access is blocked by rules; written by `updateUserStats` function, read by `getDailyScoresStats` function.*
*   **`users/{userId}`**: (Optional, based on rules) Could store general user profile information separate from stats.

---

## 4. Data Flow

Understanding how data moves through the application is key:

### Game Initialization (using Callable Functions)

1.  `App.tsx` mounts -> `AuthProvider` checks auth state.
2.  If authenticated, `GameProvider` mounts.
3.  `GameProvider`'s `useEffect` calls `fetchPuzzleV2Callable` (in `firebaseService.ts`).
4.  `fetchPuzzleV2Callable` is a Firebase callable function that automatically:
    * Attaches the user's authentication token (if available)
    * Attaches an App Check token (proving the request is from your app)
    * Sends the request to the Firebase Functions backend
5.  **Cloud Functions (fetchPuzzleV2)** receives the request:
    * Firebase automatically verifies the App Check token
    * Firebase validates authentication (though this function allows unauthenticated access)
    * The function accesses the `context` parameter to get user information
    * Reads the puzzle data from `puzzlesV2/{date}-{difficulty}` in Firestore.
    * Returns the per-difficulty puzzle data in the response.
6.  `GameProvider` receives the data, processes it, and updates state.
7.  Components re-render.

### User Actions (Making a Move)

*   User clicks a non-locked tile -> `GameGrid` -> `Tile` -> `onTileClick` prop.
*   `GameContext.handleTileClick` is called, setting `selectedTile` and showing the `ColorPickerModal`.
*   User clicks a color in the modal -> `ColorPickerModal.onSelect`.
*   `GameContext.handleColorSelect` is called:
    *   If it's the first move, calls `callUpdateStats` to trigger the `updateUserStatsCallable` function with `eventType: 'firstMove'`.
    *   Calls `applyColorChange` (in `gameUtils.ts`) which uses `floodFill` (in `gameLogic.ts`) to update the grid state.
    *   Updates the `puzzle` state (grid, moves used, checks for win/loss).
    *   Calls `checkIfOnOptimalPath` to update `isOnOptimalPath`.
    *   Checks `shouldShowAutocomplete` and potentially shows the `AutocompleteModal`.
    *   If solved, calls `handlePuzzleSolved`.
    *   Closes the color picker.
*   Components re-render based on the updated `puzzle` state.

### Updating Statistics (using Callable Functions)

1.  **Win/Loss/Try Again/Hint/First Move:** `GameContext` calls `callUpdateStats` with relevant event data.
2.  `callUpdateStats` invokes the `updateUserStatsCallable` function, passing the event data.
3.  The Firebase SDK automatically:
    * Attaches the user's authentication token
    * Attaches an App Check token (proving the request is from your app)
    * Sends the request to the Firebase Function
4.  **Cloud Functions (updateUserStats)**:
    * Firebase verifies the App Check token (rejecting if invalid)
    * Firebase authenticates the user (rejecting if invalid or missing)
    * The function accesses user ID via `context.auth.uid`
    * Performs the statistics update logic within a Firestore transaction (`userStats/{userId}`, `dailyScores/{puzzleId}/scores/{userId}`).
    * Returns a success/failure response with updated stats.
5.  `GameContext` updates the local stats state based on the response.

### Fetching Global Stats (using Callable Functions)

1.  `LandingScreen` mounts -> `useEffect` triggers `fetchDailyScoresStats`.
2.  This function calls `getDailyScoresStatsCallable` with the `puzzleId`.
3.  The Firebase SDK automatically:
    * Attaches the user's authentication token (even guest users have tokens)
    * Attaches an App Check token (proving the request is from your app)
    * Sends the request to the Firebase Function
4.  **Cloud Functions (getDailyScoresStats)**:
    * Firebase verifies the App Check token (rejecting if invalid)
    * The function finds the scores in Firestore, calculates statistics, and returns the result.
5.  `LandingScreen` updates the local state with the statistics.

### Authentication

1.  Auth state is managed through Firebase Auth.
2.  Initial auth check happens in `AuthContext.tsx` via `onAuthStateChanged` listener.
3.  Users can sign in via email/password, create a new account, or play as a guest (anonymous auth).
4.  `ensureAuthenticated` in `firebaseService.ts` ensures a user exists (potentially creating an anonymous user for guest mode).
5.  All callable functions automatically receive the user's authentication status in the `context` parameter.
6.  Auth state persistence is managed by Firebase Auth's own systems.

---

## 5. Key Features & Modules

*   **Game Logic (`gameLogic.ts`, `gameUtils.ts`):** Handles core mechanics like flood fill for color changes, identifying the largest connected region (`lockedCells`), checking win/loss conditions, applying moves, and providing hints based on the optimal path or dynamic calculation.
*   **Statistics System (`stats.ts`, `useGameStats.ts`, `storageUtils.ts`, `functions/src/index.ts#updateUserStats`):** Tracks various player metrics both locally (for immediate display) and persistently in Firestore (`userStats`, `dailyScores`). The `updateUserStats` function is the central point for backend stat updates.
*   **Authentication (`AuthContext.tsx`, `SignInScreen.tsx`, `SignUpButton.tsx`):** Manages user sign-in, sign-up, guest access, and sign-out using Firebase Auth.
*   **Tutorial System (`TutorialContext.tsx`, `tutorialConfig.ts`, `tutorialUtils.ts`, `Tutorial*.tsx` components):** Provides an interactive step-by-step guide for new players, using a predefined puzzle and solution path. Manages highlighting, overlays, and user interaction validation during the tutorial.
*   **Settings (`settings.ts`, `useSettings.ts`, `SettingsModal.tsx`, `colorUtils.ts`):** Allows users to customize accessibility (high contrast, color blindness modes) and visual/gameplay options (animations, sound, difficulty). Settings are persisted in local storage.
*   **Firebase Services (`firebaseService.ts`, `firebaseConfig.tsx`):** Initializes and exports Firebase instances, handles emulator connections, and provides core interaction functions like `fetchPuzzleV2`.

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

The emulators allow you to run Firebase services (Auth, Firestore, Functions, Pub/Sub) locally.

**Recommended Method:**

Use the custom script which handles cleanup and seeding automatically:

```bash
npm run cursor-dev
```

This script will:

1.  Attempt to kill processes using common emulator ports (8080, 9099, 5001, 8085, etc.).
2.  Start the Auth, Firestore, Functions, and Pub/Sub emulators for the `color-lock-prod` project.
3.  Wait for emulators to initialize.
4.  Run `scripts/seed-emulator.js` to populate Firestore with test data (a puzzle for today and sample scores).
5.  Set up the PUBSUB_EMULATOR_HOST environment variable.
6.  Keep the emulators running.

**Alternative Method:**

```bash
npm run local-test
```

This performs similar steps but without the aggressive port cleanup.

**Manual Method:**

Start emulators:

```bash
firebase emulators:start --only auth,firestore,functions,pubsub --project color-lock-prod
```

In a separate terminal, seed data:

```bash
node scripts/seed-emulator.js
```

**Testing Scheduled Functions:**

To trigger scheduled functions in the emulator environment:

```bash
# Trigger the daily ELO score calculation function
npm run trigger:elo:emulator

# Trigger the scheduled leaderboard calculation function
npm run trigger:leaderboard:emulator
```

These commands simulate the Pub/Sub events that would normally trigger these scheduled functions in production.

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

Emulator Testing (Functions)
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

App Check Setup
1. **Enable App Check in Firebase Console**
   - Go to Firebase Console -> Your Project -> App Check
   - Click "Get started" and follow the setup wizard
   - For web apps, you'll use reCAPTCHA v3 provider

2. **Register Your App With reCAPTCHA v3**
   - Follow the Firebase console instructions to register your site with reCAPTCHA v3
   - Get the site key and add it to your environment variables as `VITE_RECAPTCHA_SITE_KEY`

3. **Add Debug Token for Development**
   - During local development, run your app and check the browser console
   - Find a message like "App Check debug token: <token>"
   - In Firebase Console -> App Check -> Apps -> Your web app -> "Manage debug tokens"
   - Add this token to allow testing from your local environment

4. **Enable Enforcement**
   - Once you've verified everything works, go to App Check -> APIs in Firebase Console
   - For Cloud Functions, click "Enforce"
   - This will reject all requests not coming from verified app instances

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

## Development & Testing

### Testing Scheduled Functions

There are two ways to test scheduled functions in the development environment:

#### Option 1: Using Pub/Sub Emulator (Recommended)

This method simulates how Firebase schedules functions in production using Pub/Sub.

1.  **Ensure Emulators are Running:** Start the emulators, including Firestore, Functions, and Pub/Sub:
    ```bash
    npm run cursor-dev
    ```

2.  **Trigger the Scheduled Functions:**
    * **To trigger the daily ELO score calculation:**
      ```bash
      npm run trigger:elo:emulator
      ```
    * **To trigger the scheduled leaderboard calculation:**
      ```bash
      npm run trigger:leaderboard:emulator
      ```

3.  **Verify:** Check the Functions emulator logs in the terminal or Emulator UI to confirm the function was triggered and executed successfully.

#### Option 2: Using Direct Function Trigger Scripts

This method directly invokes the function logic, bypassing the Pub/Sub mechanism.

1.  **Ensure Emulators are Running:** Start the emulators, including Firestore and Functions:
    ```bash
    npm run cursor-dev
    # or
    firebase emulators:start --only firestore,functions
    ```
    
2.  **Ensure Data Exists:** Make sure the emulator's Firestore has the necessary data for the date you want to calculate (puzzle, user scores, user stats). You might need to run `npm run seed` or manually add data via the Emulator UI (`http://localhost:4000`).
    
3.  **Run the Trigger Script:**
    *   **To calculate Elo scores for TODAY's date (Default):**
        ```bash
        npm run trigger-elo
        ```
    *   **To calculate Elo scores for a specific date (e.g., 2025-03-25):**
        ```bash
        npm run trigger-elo 2025-03-25
        ```
    *   **To calculate leaderboard:**
        ```bash
        npm run trigger-leaderboard
        ```
        
4.  **Verify:** Check the script output and inspect the `userStats/{userId}` documents in the Firestore emulator UI to confirm the updates. For Elo calculation, verify the `eloScoreByDay` map has been updated for the target date. Note that the scheduled function in production still calculates for *yesterday*.
