# Firebase Emulator Testing Guide

This guide explains how to set up and use the Firebase Emulator Suite for local development and testing of the Color Lock application. Using emulators allows you to test Firebase features locally without interacting with live production data or incurring costs.

## Prerequisites

*   Firebase CLI installed and logged in (`firebase login`)
*   Project configured with `firebase use <your-project-id>`
*   Emulators selected during `firebase init` or `firebase setup:emulators:ui` (Auth, Functions, Firestore, Pub/Sub)

## Configuration

Your `firebase.json` file configures the emulators. Ensure the ports listed match the connection details in `src/services/firebaseService.ts`:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log"
      ],
      "predeploy": [
        "npm --prefix "$RESOURCE_DIR" run lint",
        "npm --prefix "$RESOURCE_DIR" run build"
      ]
    }
  ],
  "hosting": {
    // ... hosting config ...
  },
  "emulators": {
    "auth": {
      "port": 9099
    },
    "functions": {
      "port": 5001
    },
    "firestore": {
      "port": 8080
    },
    "pubsub": {
      "port": 8085
    },
    "ui": {
      "enabled": true, // Optional: Enables the Emulator UI
      "port": 4000     // Optional: Port for the Emulator UI
    },
    "singleProjectMode": true
  }
}
```

## Running the Emulators

1.  **Build Cloud Functions:** Before starting the emulators, ensure your Cloud Functions code is compiled:
    ```bash
    cd functions
    npm run build
    cd ..
    ```

2.  **Start the Emulators:**
    ```bash
    firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data
    ```
    *   `--import=./emulator-data`: Loads data (Auth users, Firestore documents) from the specified directory at startup. Create this directory if it doesn't exist.
    *   `--export-on-exit=./emulator-data`: Saves the current state of the emulators (Auth users, Firestore data) to the specified directory when you stop the emulators (e.g., with Ctrl+C). This is useful for persisting test data between sessions.

3.  **Emulator UI:** If enabled, you can access the Emulator UI at `http://localhost:4000` (or the configured port) to view data, logs, and manage the emulators.

## Running the Frontend App with Emulators

1.  **Start Emulators:** Make sure the emulators are running (see previous step).
2.  **Start Vite Dev Server:** In a **separate terminal**:
    ```bash
    npm run dev
    ```
    The frontend application (`src/services/firebaseService.ts`) is configured to automatically connect to the emulators when running on `localhost` or `127.0.0.1`.

## Testing Scheduled Functions with Pub/Sub Emulator

The Pub/Sub emulator allows you to test scheduled Cloud Functions locally by simulating the Pub/Sub triggers that Firebase uses to invoke scheduled functions.

### Setting up the Pub/Sub Emulator

1. The Pub/Sub emulator is configured to run on port 8085 in the `firebase.json` file.
2. When running the emulators, ensure `pubsub` is included:
   ```bash
   firebase emulators:start --only auth,functions,firestore,pubsub
   ```
   Or simply run all emulators with:
   ```bash
   firebase emulators:start
   ```

3. The environment variable `PUBSUB_EMULATOR_HOST=localhost:8085` should be set for any scripts that need to interact with the Pub/Sub emulator. This is automatically set in the `cursor-dev` script.

### Triggering Scheduled Functions

Unlike in production where scheduled functions are triggered based on their cron schedules, in the emulator environment, you need to manually trigger them by publishing a message to the appropriate Pub/Sub topic.

We've created convenience scripts to do this:

1. To trigger the ELO scores calculation function:
   ```bash
   npm run trigger:elo:emulator
   ```

2. To trigger the leaderboard calculation function:
   ```bash
   npm run trigger:leaderboard:emulator
   ```

These scripts publish a message to the Pub/Sub emulator topics that mimic the formats Firebase uses to trigger scheduled functions.

### How the Trigger Works

1. Firebase uses a specific topic naming convention for scheduled functions: `firebase-schedule-[functionName]-[region]`
2. The trigger script constructs this topic name and publishes an empty message to it
3. The Functions emulator detects this message and invokes the corresponding function

### Troubleshooting Pub/Sub Triggers

If your scheduled function isn't triggered when using the convenience scripts:

1. Ensure the function is correctly exported and defined with the `schedule` trigger in your functions code
2. Check that the function name in the script matches exactly the function name in your code
3. Verify that the Pub/Sub emulator is running (check the Emulator UI)
4. Look at the Functions emulator logs for any errors related to the function initialization
5. The trigger script will show specific error messages that can help diagnose issues

## App Check in Emulators

*   **Frontend:** The `firebaseService.ts` includes code to set the `FIREBASE_APPCHECK_DEBUG_TOKEN` global flag to `true` during development. This tells the App Check SDK (configured with reCAPTCHA v3) to request a debug token.
*   **Getting the Debug Token:** When you run the frontend (`npm run dev`) with emulators running, open the browser's developer console. You should see a message like:
    ```
    App Check debug token: <SOME_LONG_TOKEN_STRING>...
    ```
    Copy this token.
*   **Adding the Debug Token to Firebase:** Go to your *actual* Firebase project console (not the emulator UI):
    *   Project Settings -> App Check
    *   Click on the "Apps" tab.
    *   Select your web application.
    *   Click "Manage debug tokens".
    *   Click "Add debug token" and paste the token you copied.
*   **Backend (Functions):** The `onCall` functions in `functions/src/index.ts` use the v2 API with `enforceAppCheck: true` option. In emulator mode, you can test your functions by adding a valid debug token as described above. Temporarily setting `enforceAppCheck: false` is another option but less recommended.

    **Note:** In production, the `enforceAppCheck: true` option ensures that all requests have valid App Check tokens automatically, without you having to write manual verification code.

## Seeding Emulator Data

You often need initial data (like puzzles or user stats structures) in Firestore for local testing.

### Manual Seeding (via Emulator UI)

*   Start the emulators (`firebase emulators:start`).
*   Open the Emulator UI (`http://localhost:4000`).
*   Navigate to the Firestore tab.
*   Manually add collections (`puzzles`, `userStats`, `dailyScores`) and documents. This is suitable for simple setups.

### Scripted Seeding

For more complex or repeatable seeding:

1.  **Create a Seed Script:** Create a script (e.g., `scripts/seed-emulator.js`) that uses the Firebase Admin SDK to interact with the *emulated* Firestore instance.

    ```javascript
    // Example: scripts/seed-emulator.js
    // Make sure to install firebase-admin: npm install firebase-admin
    const admin = require('firebase-admin');
    const { dateKeyForToday } = require('../src/utils/dateUtils'); // Adjust path if needed

    // Point Admin SDK to Firestore Emulator
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

    admin.initializeApp({ projectId: 'your-project-id' }); // Use your actual project ID or a dummy one

    const db = admin.firestore();

    async function seedData() {
      const today = dateKeyForToday ? dateKeyForToday() : new Date().toISOString().split('T')[0]; // Handle potential import issue
      console.log(`Seeding data for date: ${today}`);

      // Example: Seed a puzzle document
      const puzzleRef = db.collection('puzzles').doc(today);
      await puzzleRef.set({
        targetColor: { r: 255, g: 0, b: 0 }, // Example Red
        initialGrid: [/* Your 5x5 grid data */],
        states: [/* Array of state objects */],
        actions: [/* Array of action objects */],
        algoScore: 7, // Example score
        // Add other necessary fields based on FirestorePuzzleData type
      }, { merge: true }); // Use merge to avoid overwriting if run multiple times

      console.log(`Seeded puzzle for ${today}`);

      // Add more seeding logic for userStats, dailyScores if needed

      console.log('Seeding complete.');
    }

    seedData().catch(console.error);
    ```

2.  **Run the Seed Script:** Execute the script *while the emulators are running*:
    ```bash
    node scripts/seed-emulator.js
    ```

3.  **Export Seeded Data:** After seeding, stop the emulators (`Ctrl+C`) to trigger the `--export-on-exit=./emulator-data` process. The seeded data will now be saved in the `emulator-data` directory and automatically imported the next time you start the emulators with the `--import` flag.

## Testing Function Calls

You can test the callable functions directly using tools like `curl` or Postman against the Functions emulator endpoint (`http://localhost:5001/<project-id>/<region>/<functionName>`), but remember:

*   `onCall` functions expect a specific request format (`{"data": <your_payload>}`).
*   They handle authentication differently. You might need to pass an `Authorization: Bearer <test_token>` header or rely on the emulator skipping auth checks.
*   App Check is skipped in the emulator, so you don't need a valid App Check token for direct emulator calls.

Refer to the [Firebase documentation on calling functions via HTTP requests](https://firebase.google.com/docs/functions/callable-reference#http_request_format) for the exact structure.

## Troubleshooting

*   **Connection Errors:** Ensure emulator ports in `firebase.json` match `firebaseService.ts`. Check firewall settings.
*   **Function Errors:** Check the Functions emulator logs in the terminal where `firebase emulators:start` is running or in the Emulator UI.
*   **Data Not Appearing:** Verify the `--import` path is correct. Check Firestore rules in the Emulator UI (they might block writes). Ensure your seeding script is targeting the correct emulator host/port.
*   **App Check Failing Locally:** Ensure you've added the correct Debug Token from your browser console to the Firebase project settings. Verify the frontend is running in development mode (`localhost` or `127.0.0.1`).
*   **Auth Issues:** Check the Auth emulator tab in the UI. Ensure sign-in methods are enabled in your *actual* Firebase project settings (emulators often inherit these).
*   **Scheduled Functions Not Triggered:** If using the trigger scripts, ensure the Pub/Sub emulator is running and that the function name matches exactly. Check the Functions emulator logs for any initialization errors. 