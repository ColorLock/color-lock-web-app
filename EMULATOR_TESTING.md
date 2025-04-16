# Testing with Firebase Emulators

This guide explains how to test the Color Lock app using Firebase emulators for local development.

## Prerequisites

- Node.js installed
- Firebase CLI installed (`npm install -g firebase-tools`)
- Firebase project set up (for configuration)

## Quick Start

There are two ways to start the emulators:

### Option 1: Using the Cursor-specific script (Recommended)

```bash
npm run cursor-dev
```

This enhanced script will:
1. Check for and kill any existing emulators causing port conflicts
2. Start the Firebase emulators (Auth, Firestore, and Functions)
3. Wait for emulators to initialize
4. Seed the Firestore emulator with test data
5. Keep the emulators running until you press Ctrl+C

### Option 2: Using the standard script

```bash
npm run local-test
```

This will:
1. Start the Firebase emulators (Auth, Firestore, and Functions)
2. Wait for emulators to initialize
3. Seed the Firestore emulator with test data
4. Keep the emulators running until you press Ctrl+C

## Running Your App

After starting the emulators, open a **new terminal window** and run:

```bash
npm run dev
```

You should see output like:
```
> vite
  VITE v6.2.2  ready in 356 ms
  ➜  Local:   http://localhost:3001/
  ➜  Network: use --host to expose
```

## Verifying Emulator Setup

### Check Emulator UI
The emulators provide a UI for inspection:
- **Main Emulator UI**: http://localhost:4000/
- **Firestore Data Viewer**: http://localhost:4000/firestore
- **Functions Logs**: http://localhost:4000/functions

### Verify Seeded Data
1. Open the Firestore Data Viewer
2. Navigate to the `puzzles` collection - you should see a document with today's date
3. Navigate to the `dailyScores` collection - you should see:
   - A document with today's date 
   - Inside that document, a `scores` subcollection with user scores

### Check Functions
The emulator should show three Cloud Functions:
- `fetchPuzzle`
- `updateUserStats`
- `updateUserStatsHttp`
- `getDailyScoresStats`
- `getDailyScoresStatsHttp`
- `getUserStats`
- `getUserStatsHttp`

## Testing with API Gateway

In production, the app uses Google Cloud API Gateway to securely access the Firebase Cloud Functions. For local development, there are several options:

### Direct Emulator Testing (Default)

By default, when running the app with `npm run dev` while emulators are active, the code in `firebaseService.ts` will detect this and use direct emulator URLs. This bypasses the API Gateway but allows testing of function logic.

You'll see log messages like:
```
Using Emulator URL: http://localhost:5001/color-lock-prod/us-central1/fetchPuzzle
```

### Mock API Gateway Testing

If you want to test more closely to the production setup:

1. **Local Proxy Option**: Create a simple proxy server that mimics the API Gateway:
   
   ```bash
   # Install required packages
   npm install express cors http-proxy-middleware --save-dev
   
   # Create a proxy.js file (scripts/mock-gateway.js)
   const express = require('express');
   const { createProxyMiddleware } = require('http-proxy-middleware');
   const cors = require('cors');
   
   const app = express();
   app.use(cors());
   
   // Proxy all requests to the Functions emulator
   app.use('/', createProxyMiddleware({
     target: 'http://localhost:5001/color-lock-prod/us-central1',
     changeOrigin: true,
     onProxyReq: (proxyReq, req) => {
       // Forward the original Authorization header to X-Forwarded-Authorization
       const authHeader = req.headers.authorization;
       if (authHeader) {
         proxyReq.setHeader('X-Forwarded-Authorization', authHeader);
       }
     }
   }));
   
   const PORT = 8888;
   app.listen(PORT, () => {
     console.log(`Mock API Gateway running at http://localhost:${PORT}`);
   });
   ```

2. Run the mock gateway:
   ```bash
   node scripts/mock-gateway.js
   ```

3. Update your `.env.local` to point to the mock gateway:
   ```
   VITE_API_GATEWAY_URL=http://localhost:8888
   ```

## Common Issues & Troubleshooting

### Port Conflicts

If you see errors like:
```
⚠  auth: Port 9099 is not open on localhost, could not start Authentication Emulator
⚠  firestore: Port 8080 is not open on localhost, could not start Firestore Emulator
```

This means other processes are using these ports. The `cursor-dev` script will automatically attempt to clean up these processes, but if it fails:

1. Find the processes using these ports:
   ```
   lsof -i :8080,9099,5001,4400,4000
   ```

2. Kill them manually:
   ```
   kill -9 [PID]
   ```
   
3. Or kill all Java processes (which typically run Firebase emulators):
   ```
   killall -9 java
   ```

### Emulator Data Structure

The seeded data includes:
- A puzzle document in `puzzles/[today's date]`
- Daily scores in `dailyScores/[today's date]/scores/[userID]`

If you're not seeing this exact structure in the emulator UI, there might be an issue with the seed script.

### App Not Connected to Emulators

If your app isn't connecting to the emulators:

1. Verify in browser console that you see:
   ```
   Connecting to Firebase emulators
   ```

2. Check that `useEmulators` flag is true in `src/services/firebaseService.ts`

3. Ensure you're running in development mode (`npm run dev`)

### API Gateway Issues

If you're using a mock API Gateway and experiencing issues:

1. Check if the mock gateway is running (`node scripts/mock-gateway.js`)
2. Verify that your `.env.local` has the correct gateway URL
3. Look at browser Network tab to ensure requests are going to the mock gateway URL
4. Check the mock gateway console for any errors or connection issues

## Debugging

### Console Debugging Tools

You can use browser console debugging functions:

```javascript
// Log connection status
window.testFirebase.logConnectionInfo()

// Check if a document exists
window.testFirebase.checkDocument('puzzles', '2025-04-01')
```

### Access Cloud Functions

You can test functions directly:

```javascript
window.testFirebase.testFunction('2025-04-01')
```

### Testing Token Forwarding

When using a mock API Gateway, you can check token forwarding in function logs:

```javascript
// In browser console
window.testFirebase.logTokenInfo()
```

## Manual Setup (Advanced)

If you prefer running each step manually:

### 1. Start Firebase Emulators

```bash
npm run emulators
```

### 2. Seed Test Data

In a separate terminal:

```bash
npm run seed
```

### 3. Start the App

In another terminal:

```bash
npm run dev
```

## Cleanup

When you're done testing:

1. Stop the app (Ctrl+C in its terminal)
2. Stop the emulators (Ctrl+C in the emulator terminal)
3. If using a mock gateway, stop it too (Ctrl+C in its terminal)
   
Both the `cursor-dev` and `local-test` scripts handle cleanup automatically when you press Ctrl+C.

## What's Being Tested

The seed script creates the following:

1. A sample puzzle document for today's date
2. A daily scores document with 10 player scores:
   - 3 players with the best score (6)
   - 7 other players with scores between 7 and 15
   - Average score around 9.5

This allows you to test the functionality of the `getDailyScoresStats` function. 