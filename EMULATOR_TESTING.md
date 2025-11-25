# Firebase Emulator Testing Guide

Local development with Firebase Emulators allows you to test all Firebase features without using production data or incurring costs.

## Quick Start

### One Command Setup

```bash
npm run cursor-dev
```

This single command:
1. Builds the Cloud Functions
2. Starts all Firebase emulators (Auth, Firestore, Functions)
3. Seeds the database with test data (puzzles, users, leaderboards, usageStats)
4. Persists data between sessions

Once the emulators are ready, open a new terminal and start the frontend:

```bash
npm run dev
```

That's it! Your app is now running against local emulators with test data.

---

## Emulator URLs

| Service       | URL                          |
|---------------|------------------------------|
| Emulator UI   | http://localhost:4000        |
| Firestore     | http://localhost:8080        |
| Auth          | http://localhost:9099        |
| Functions     | http://localhost:5001        |

---

## Seeded Test Data

The seed script (`npm run seed`) automatically creates:

| Collection          | Description                                      |
|---------------------|--------------------------------------------------|
| `puzzles`           | 11 days of puzzles (today + last 10 days)        |
| `userPuzzleHistory` | 10 test users with puzzle history & leaderboards |
| `dailyScoresV2`     | Per-difficulty daily scores                      |
| `usageStats`        | Daily usage statistics (uniqueUsers, totalAttempts) |

### Re-seeding Data

To re-seed data while emulators are running:

```bash
npm run seed
```

To seed for a specific date:

```bash
node scripts/seed-emulator.js 2024-07-20
```

---

## Data Persistence

Emulator data is automatically saved to `./firebase-emulator-data/` when you stop the emulators (Ctrl+C) and restored on the next start.

To start fresh (clear all data):

```bash
rm -rf firebase-emulator-data/
npm run cursor-dev
```

---

## Manual Commands

If you need more control, you can run individual steps:

```bash
# Build functions only
cd functions && npm run build && cd ..

# Start emulators without seeding
npm run emulators

# Seed data (emulators must be running)
npm run seed
```

---

## Testing Cloud Functions

The frontend automatically connects to local emulators when running on `localhost`. All callable functions work the same way as in production.

### Testing the Usage Stats Endpoint

With emulators running and data seeded, the `getUsageStats` function can be tested:

1. Open the app at http://localhost:5173
2. Navigate to the Usage Stats screen
3. The chart will display data from the seeded `usageStats` collection

---

## Troubleshooting

### Ports Already in Use

If you see port conflict errors, kill any existing processes:

```bash
pkill -f "firebase emulators"
```

### Functions Not Working

Ensure functions are built before starting emulators:

```bash
cd functions && npm run build && cd ..
```

### Data Not Appearing

1. Check that emulators are running (Emulator UI at http://localhost:4000)
2. Re-run the seed script: `npm run seed`
3. Check the terminal output for any errors

### App Check Issues

App Check is automatically disabled in emulator mode. No debug tokens are required for local development.

---

## npm Scripts Reference

| Command               | Description                                    |
|-----------------------|------------------------------------------------|
| `npm run cursor-dev`  | **Recommended**: Full setup (build + start + seed) |
| `npm run emulators`   | Start emulators only (no build, no seed)       |
| `npm run seed`        | Seed test data (emulators must be running)     |
| `npm run dev`         | Start the frontend dev server                  |
