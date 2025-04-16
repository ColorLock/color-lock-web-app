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
    *   [Backend (Firebase Functions on Cloud Run with API Gateway)](#backend-firebase-functions-on-cloud-run-with-api-gateway)
    *   [Database (Firestore)](#database-firestore)
4.  [Data Flow](#data-flow)
    *   [Game Initialization (via API Gateway)](#game-initialization-via-api-gateway)
    *   [User Actions (Making a Move)](#user-actions-making-a-move)
    *   [Updating Statistics (via API Gateway)](#updating-statistics-via-api-gateway)
    *   [Fetching Global Stats (via API Gateway)](#fetching-global-stats-via-api-gateway)
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
    *   [Emulator Testing (Functions & Gateway)](#emulator-testing-functions--gateway)
    *   [Debugging Firebase Functions](#debugging-firebase-functions)
8.  [Deployment](#deployment)
    *   [Frontend (Netlify)](#frontend-netlify)
    *   [Backend (Firebase Functions)](#backend-firebase-functions-1)
    *   [API Gateway (Google Cloud)](#api-gateway-google-cloud)
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

### Backend (Firebase Functions on Cloud Run with API Gateway)

The backend logic resides in Firebase Cloud Functions (Gen 2), which run on Cloud Run. Due to organizational security policies (`constraints/iam.allowedPolicyMemberDomains`), these Cloud Run services are deployed as **private** and cannot be invoked directly by unauthenticated users or services outside the GCP project (like the public internet).

To securely expose these functions to the authenticated frontend, **API Gateway** is used as a managed proxy:

1.  **API Gateway Endpoint:** A public HTTPS endpoint managed by Google Cloud. The frontend application interacts *only* with this gateway URL.
2.  **Firebase Auth Validation:** The gateway is configured (via an OpenAPI specification) to validate incoming Firebase ID tokens (`Authorization: Bearer <token>`). It checks the token's signature, issuer, audience, and expiry against your Firebase project's configuration. Only valid tokens are accepted.
3.  **IAM-Authenticated Backend Calls:** If the Firebase token is valid, the gateway invokes the **private** Cloud Run service URL. It does *not* use the user's token for this call. Instead, it uses a designated **Service Account** (e.g., `api-gateway-invoker@...`) which has been granted the `roles/run.invoker` permission on the Cloud Run service. This invocation uses a Google-signed ID token for the service account, satisfying Cloud Run's IAM authentication requirement.
4.  **Original Token Forwarding:** The gateway forwards the original user's Firebase ID token in the `X-Forwarded-Authorization` header to the backend function.
5.  **Backend Function Logic:** The Cloud Function code can optionally re-verify the token from the `X-Forwarded-Authorization` header using the Firebase Admin SDK to get the user's UID and claims for business logic (like accessing user-specific data in Firestore).

This architecture ensures:
*   The Cloud Run service itself is not publicly exposed, adhering to security policies.
*   Only requests from users authenticated via your Firebase project can reach the backend logic.
*   The gateway handles the complexity of JWT validation and secure backend invocation.

*Relevant Files:* `functions/src/index.ts`, `openapi.yaml` (API Gateway configuration), `firebase.json` (for emulator config).

### Database (Firestore)

Firestore is used to store persistent data:

*   **`puzzles/{date}`**: Stores the daily puzzle configuration, including the initial grid state (`states[0]`), target color, algorithm score (`algoScore`), and the sequence of optimal moves (`actions`). *Client access is blocked by rules; accessed only via `fetchPuzzle` function.*
*   **`userStats/{userId}`**: Stores individual user statistics (streaks, games played, best scores per day, hints used, etc.). *Accessible only by the authenticated user.* See `prompts/userStats_descriptions.txt` for field details.
*   **`dailyScores/{date}/scores/{userId}`**: Stores the best score achieved by each user for a specific puzzle date. This structure allows efficient querying for daily leaderboards or global stats. *Client access is blocked by rules; written by `updateUserStats` function, read by `getDailyScoresStats` function.*
*   **`users/{userId}`**: (Optional, based on rules) Could store general user profile information separate from stats.

---

## 4. Data Flow

Understanding how data moves through the application is key:

### Game Initialization (via API Gateway)

1.  `App.tsx` mounts -> `AuthProvider` checks auth state.
2.  If authenticated, `GameProvider` mounts.
3.  `GameProvider`'s `useEffect` calls `fetchPuzzle` (in `firebaseService.ts`).
4.  `fetchPuzzle` ensures authentication (signing in anonymously if needed) and retrieves the user's **Firebase ID Token**.
5.  `fetchPuzzle` makes an HTTPS POST request to the **API Gateway URL** for the `fetchPuzzle` endpoint, including the ID token in the `Authorization: Bearer <token>` header.
6.  **API Gateway** receives the request:
    *   Validates the Firebase ID token. If invalid, rejects with 401/403.
    *   If valid, prepares to call the private Cloud Run service URL for the `fetchPuzzle` function.
    *   Uses its configured **Invoker Service Account** to generate a Google-signed ID token for the backend call.
    *   Forwards the request to Cloud Run, replacing the `Authorization` header with the service account token and adding the original user token to the `X-Forwarded-Authorization` header.
7.  **Cloud Run (fetchPuzzle function)** receives the request:
    *   Verifies the incoming request has a valid IAM token from the allowed Invoker Service Account (this happens automatically via Cloud Run's built-in auth).
    *   Reads the `X-Forwarded-Authorization` header to get the original user's Firebase token.
    *   Verifies the user's token using the Admin SDK (`admin.auth().verifyIdToken(...)`) to confirm identity and get the UID.
    *   Reads the puzzle data from `puzzles/{date}` in Firestore.
    *   Returns the puzzle data in the response.
8.  **API Gateway** forwards the response back to the frontend.
9.  `GameProvider` receives the data, processes it, and updates state.
10. Components re-render.

### User Actions (Making a Move)

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

### Updating Statistics (via API Gateway)

1.  **Win/Loss/Try Again/Hint/First Move:** `GameContext` calls `callUpdateStats` with relevant event data.
2.  `callUpdateStats` retrieves the user's **Firebase ID Token**.
3.  `callUpdateStats` makes an HTTPS POST request to the **API Gateway URL** for the `updateUserStats` endpoint, including the ID token in the `Authorization: Bearer <token>` header and the event data in the body.
4.  **API Gateway** validates the token and invokes the private `updateUserStats` Cloud Run function using its **Invoker Service Account**, forwarding the original token in `X-Forwarded-Authorization`.
5.  **Cloud Run (updateUserStats function)**:
    *   Verifies the invoker identity (automatic).
    *   Retrieves the user's UID by verifying the token from `X-Forwarded-Authorization` using the Admin SDK.
    *   Performs the statistics update logic within a Firestore transaction (`userStats/{userId}`, `dailyScores/{puzzleId}/scores/{userId}`).
    *   Returns a success/failure response, potentially with updated stats.
6.  **API Gateway** forwards the response to the frontend.
7.  `GameContext` (potentially via `useGameStats`) updates the local stats state based on the response.

### Fetching Global Stats (via API Gateway)

1.  `LandingScreen` mounts -> `useEffect` triggers `fetchDailyScoresStats`.
2.  This function retrieves the user's **Firebase ID Token** (even guest users have tokens).
3.  It makes an HTTPS POST request to the **API Gateway URL** for the `getDailyScoresStats` endpoint, including the ID token in the `Authorization: Bearer <token>` header and the `puzzleId` in the body.
4.  **API Gateway** validates the token and invokes the private `getDailyScoresStats` Cloud Run function using its **Invoker Service Account**.
5.  **Cloud Run (getDailyScoresStats function)**:
    *   Verifies the invoker identity (automatic).
    *   Could verify the user token from `X-Forwarded-Authorization` if needed, but likely not necessary for global stats.
    *   Queries the `dailyScores/{puzzleId}/scores` subcollection.
    *   Calculates aggregate stats.
    *   Returns the stats.
6.  **API Gateway** forwards the response to the frontend.
7.  `LandingScreen` updates its state and displays the global stats.

### Authentication

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

Emulator Testing (Functions & Gateway)
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

API Gateway (Google Cloud)
The API Gateway requires separate deployment steps from the Firebase Functions.

1. **Prerequisites:**
   - Google Cloud CLI (`gcloud`) installed and configured
   - Proper IAM permissions to create API Gateways, manage service accounts, and configure services

2. **Service Account Setup:**
   - Create a dedicated service account for API Gateway to invoke Cloud Run functions:
     ```
     gcloud iam service-accounts create api-gateway-invoker \
       --display-name "API Gateway Invoker"
     ```
   - Grant this service account the Cloud Run Invoker role on your functions:
     ```
     gcloud run services add-iam-policy-binding fetchpuzzle-function \
       --member="serviceAccount:api-gateway-invoker@PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/run.invoker"
     ```
     (Repeat for other function services)

3. **Deploy the API Gateway:**
   - Create an API Definition from the OpenAPI spec:
     ```
     gcloud api-gateway api-configs create colorlock-config-v1 \
       --api=colorlock-api \
       --openapi-spec=openapi.yaml \
       --project=PROJECT_ID \
       --backend-auth-service-account=api-gateway-invoker@PROJECT_ID.iam.gserviceaccount.com
     ```
   - Deploy the gateway:
     ```
     gcloud api-gateway gateways create colorlock-gateway \
       --api=colorlock-api \
       --api-config=colorlock-config-v1 \
       --location=us-central1 \
       --project=PROJECT_ID
     ```

4. **Update Frontend Configuration:**
   - Update environment variables in the frontend to point to the new gateway URL:
     ```
     VITE_API_GATEWAY_URL=https://colorlock-gateway-<hash>.uc.gateway.dev
     ```

5. **Testing:**
   - Validate the gateway using curl:
     ```
     curl -X POST -H "Authorization: Bearer <valid-firebase-token>" \
       -H "Content-Type: application/json" \
       -d '{"date":"2023-07-01"}' \
       https://colorlock-gateway-<hash>.uc.gateway.dev/fetchPuzzle
     ```

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