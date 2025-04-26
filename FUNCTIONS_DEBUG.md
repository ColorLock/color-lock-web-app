# Firebase Functions Emulator Debug Guide

This guide helps troubleshoot issues with Firebase Functions in the emulator environment, specifically focusing on the `getGlobalLeaderboard` function that may not be properly registered.

## Understanding the Issue

The current issue is that the `getGlobalLeaderboard` function is defined in the source code but is not being automatically registered in the Firebase Emulator. The updated `cursor-emulator.sh` script adds more logging to help diagnose the problem.

## Debugging Steps

1. **Enhanced Logging**: 
   - Run `npm run cursor-dev` to start the emulators with enhanced logging
   - Review the following logged information:
     - Exported functions in source code
     - Firebase.json functions configuration
     - Compiled functions in lib directory
     - Functions actually loaded by the emulator

2. **What to Look For**:
   - Check if `getGlobalLeaderboard` appears in the source code exports
   - Check if it's properly compiled to the lib directory
   - Check if it's registered in the emulator's function list

## Common Causes of Missing Functions

1. **Version Mismatch**:
   - Firebase Functions v1 vs v2 API differences
   - The loading mechanism differs between versions

2. **Export Format**:
   - Functions must be correctly exported to be detected

3. **Function Type**:
   - Different function types (HTTP, callable, scheduled) have different registration processes

4. **Compilation Issues**:
   - TypeScript errors or warnings might prevent proper compilation

## Manual Function Registration

If the function still doesn't appear in the emulator, you can use one of our helper scripts:

1. **Register Global Leaderboard Function**:
   ```
   npm run register-global-leaderboard
   ```
   This script will attempt to manually register the `getGlobalLeaderboard` function in the emulator.

2. **Generic Function Update**:
   ```
   npm run update-function getGlobalLeaderboard
   ```
   This will attempt to register/update any function by name.

## Restarting the Emulator

If all else fails, try restarting the emulator completely:

1. Stop all running emulators
2. Clean up any stray processes
3. Run `npm run cursor-dev` again

## Verifying Function Registration

After registration, you can verify that the function is available via:

1. **Emulator UI**:
   - Visit the Emulator UI at http://localhost:4000/functions
   - Check if `getGlobalLeaderboard` is listed

2. **API Check**:
   ```
   curl http://localhost:4000/functions/api/functions
   ```
   This should return a list of all registered functions.

## Technical Details for Debugging

The `getGlobalLeaderboard` function is defined as an `onCall` function using Firebase Functions v2 API:

```typescript
export const getGlobalLeaderboard = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        // Function implementation...
    }
);
```

This should be compiled to JavaScript and registered in the emulator as a callable function. 