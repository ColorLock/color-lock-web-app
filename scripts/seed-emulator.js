const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Use jiti to allow requiring TypeScript files directly if needed for enums
const jiti = require('jiti')(__filename);
const { DifficultyLevel } = jiti('../src/types/settings'); // Import DifficultyLevel enum

// Initialize Firebase Admin without service account - this works with emulators
admin.initializeApp({
  projectId: 'color-lock-prod'
});

// Connect to emulators
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

const db = admin.firestore();

// Function to get a date string (YYYY-MM-DD) for a given offset from today
function getOffsetDateString(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Generate dates around today (e.g., last 5 days and next 5 days)
const DATES = Array.from({ length: 11 }, (_, i) => getOffsetDateString(i - 5));
console.log("Generated Dates for Seeding:", DATES);

// Check if a specific date was provided as a command line argument
const dateArg = process.argv[2]; // e.g., node seed-emulator.js 2024-07-20
// Use the provided date or today's date (local)
const todayStr = dateArg || getOffsetDateString(0); // Use today's local date as default
console.log(`Seeding data for puzzle date: ${todayStr} ${dateArg ? '(from command line argument)' : '(using local machine date)'}`);

// Helper to create a map from an array of dates and a value function
function createDateMap(dates, valueFn) {
    return dates.reduce((acc, date, index) => {
        acc[date] = valueFn(date, index);
        return acc;
    }, {});
}

// Helper to create sample Elo scores
function createSampleEloScores(dates) {
    return dates.reduce((acc, date, index) => {
        // Only add score sometimes to simulate missing days
        if (Math.random() > 0.3) {
            // Score between 50 and 150
            acc[date] = Math.floor(Math.random() * 101) + 50;
        }
        return acc;
    }, {});
}

// Create sample data
async function seedData() {
  try {
    console.log('Seeding user stats data with recent dates...');

    // --- USER 1: Existing User (SGD12...) ---
    const user1Id = 'SGD12BjUImhOYGfsdrZzJFnj2V12';
    const user1PlayedDays = DATES; // Played all generated days
    const user1GoalAchievedDays = user1PlayedDays.filter((_, i) => i % 2 === 0); // Achieved goal on even index days
    const user1GoalBeatenDays = user1GoalAchievedDays.filter((_, i) => i % 3 === 0); // Beat goal on subset of achieved days
    const user1WonDays = user1PlayedDays; // Won all played days
    const user1FirstTryWinDays = user1WonDays.filter((d, i) => DATES.slice(-2).includes(d)); // Won first try last 2 days

    const user1BestScores = createDateMap(user1PlayedDays, (d, i) => 15 + (i % 6)); // Scores 10-15
    // *** Create difficulty map for user 1 ***
    const user1Difficulties = createDateMap(user1PlayedDays, (d, i) => {
         // Example: Alternate difficulties
         const dayIndex = DATES.indexOf(d);
         if (dayIndex % 3 === 0) return DifficultyLevel.Hard;
         if (dayIndex % 3 === 1) return DifficultyLevel.Medium;
         return DifficultyLevel.Easy;
    });

    await db.collection('userStats').doc(user1Id).set({
      attemptsPerDay: createDateMap(user1PlayedDays, (d, i) => (user1FirstTryWinDays.includes(d) ? 1 : (i % 4) + 1)), // 1 attempt if first try win
      bestScoresByDay: user1BestScores,
      bestScoresByDayDifficulty: user1Difficulties, // *** Add difficulty map ***
      goalAchievedDays: user1GoalAchievedDays,
      hintUsageByDay: createDateMap(user1PlayedDays, (d, i) => (i % 5 === 0 ? 1 : 0)), // Hint used every 5th day
      playedDays: user1PlayedDays,
      totalGamesPlayed: user1PlayedDays.length, // Assuming one game start per played day for simplicity
      totalHintsUsed: user1PlayedDays.filter((d, i) => i % 5 === 0).length,
      totalMovesUsed: user1PlayedDays.reduce((sum, d, i) => sum + (10 + (i % 6)) * (user1FirstTryWinDays.includes(d) ? 1 : (i % 4) + 1), 0), // Estimate moves
      totalWins: user1WonDays.length,
      winsPerDay: createDateMap(user1WonDays, () => 1), // 1 win per won day
      currentFirstTryStreak: user1FirstTryWinDays.length === 2 ? 2 : 0, // Streak if won first try last 2 days played
      longestFirstTryStreak: 4, // Example
      firstTryStreakDate: user1FirstTryWinDays.length > 0 ? user1FirstTryWinDays[user1FirstTryWinDays.length - 1] : null, // Date of *last* first try win
      attemptsToAchieveBotScore: createDateMap(user1GoalAchievedDays, (d, i) => (user1FirstTryWinDays.includes(d) ? 1 : (i % 4) + 1)),
      attemptsToBeatBotScore: createDateMap(user1GoalBeatenDays, (d, i) => (user1FirstTryWinDays.includes(d) ? 1 : (i % 4) + 1)), // Mimics attemptsToAchieveBotScore
      goalBeatenDays: user1GoalBeatenDays,
      attemptsToWinByDay: createDateMap(user1WonDays, (d, i) => (user1FirstTryWinDays.includes(d) ? 1 : (i % 4) + 1)), // Attempt number for win
      attemptWhenHintUsed: createDateMap(user1PlayedDays, (d, i) => (i % 5 === 0 ? (i % 2) + 1 : null)), // Hint on attempt 1 or 2 if used
      eloScoreByDay: null, //createSampleEloScores(user1PlayedDays), // Add sample Elo scores
      // Initialize aggregate fields to null (they will be calculated by the function)
      eloScoreAvg: null,
      eloScoreTotal: null,
      eloScoreAvgLast30: null,
      eloScoreTotalLast30: null,
      lastPlayedIsoDate: getOffsetDateString(0), // Set a default last played date
      // Tie/Beat Bot Streak
      currentTieBotStreak: user1PlayedDays.slice(-4).every(d => user1GoalAchievedDays.includes(d)) ? 4 : 0, // Example: streak if achieved goal last 4 days
      longestTieBotStreak: 7, // Example
      tieBotStreakDate: user1PlayedDays.slice(-4).every(d => user1GoalAchievedDays.includes(d)) ? user1PlayedDays[user1PlayedDays.length - 1] : null, // Date of last tie/beat
      // Puzzle Completed (Win) Streak
      currentPuzzleCompletedStreak: user1PlayedDays.length, // Won all days played
      longestPuzzleCompletedStreak: user1PlayedDays.length, // Won all days played
      puzzleCompletedStreakDate: user1PlayedDays[user1PlayedDays.length - 1], // Date of last win
    }, { merge: true }); // Use merge to avoid overwriting completely
    console.log(`Seeded User 1 (${user1Id})`);

    // --- USER 2: New User (iN1Rw...) ---
    const user2Id = 'iN1RwQKXq4NxCItrGnInbGUFjen1';
    const user2PlayedDays = DATES.slice(-4); // Played last 4 days
    const user2GoalAchievedDays = user2PlayedDays; // Achieved all played days
    const user2GoalBeatenDays = user2PlayedDays.slice(-2); // Beat goal last 2 days
    const user2WonDays = user2PlayedDays; // Won all played days
    const user2FirstTryWinDays = user2WonDays.filter((d, i) => (i % 2) + 1 === 1); // Won first try on some days

    const user2BestScores = createDateMap(user2PlayedDays, (d, i) => 15 + (i % 3)); // Scores 9-11
    // *** Create difficulty map for user 2 ***
    const user2Difficulties = createDateMap(user2PlayedDays, () => DifficultyLevel.Easy); // Example: Always Easy

    await db.collection('userStats').doc(user2Id).set({
        attemptsPerDay: createDateMap(user2PlayedDays, (d, i) => (i % 2) + 1), // 1 or 2 attempts
        bestScoresByDay: user2BestScores,
        bestScoresByDayDifficulty: user2Difficulties, // *** Add difficulty map ***
        goalAchievedDays: user2GoalAchievedDays,
        hintUsageByDay: createDateMap(user2PlayedDays, (d, i) => (i === 1 ? 1 : 0)), // Hint used on second day played
        playedDays: user2PlayedDays,
        totalGamesPlayed: user2PlayedDays.length,
        totalHintsUsed: 1,
        totalMovesUsed: user2PlayedDays.reduce((sum, d, i) => sum + (9 + (i % 3)) * ((i % 2) + 1), 0),
        totalWins: user2WonDays.length,
        winsPerDay: createDateMap(user2WonDays, () => 1),
        currentFirstTryStreak: user2FirstTryWinDays.length > 0 && user2FirstTryWinDays.includes(user2PlayedDays[user2PlayedDays.length - 1]) ? 1 : 0, // Example: 1 if last day was first try
        longestFirstTryStreak: 1, // Example
        firstTryStreakDate: user2FirstTryWinDays.length > 0 ? user2FirstTryWinDays[user2FirstTryWinDays.length - 1] : null, // Example
        attemptsToAchieveBotScore: createDateMap(user2GoalAchievedDays, (d, i) => (i % 2) + 1),
        attemptsToBeatBotScore: createDateMap(user2GoalBeatenDays, (d, i) => (i % 2) + 1), // Mimics attemptsToAchieveBotScore
        goalBeatenDays: user2GoalBeatenDays,
        attemptsToWinByDay: createDateMap(user2WonDays, (d, i) => (i % 2) + 1), // Attempt number for win
        attemptWhenHintUsed: createDateMap(user2PlayedDays, (d, i) => (i === 1 ? 1 : null)),
        eloScoreByDay: null, //createSampleEloScores(user2PlayedDays), // Add sample Elo scores
        eloScoreAvg: null,
        eloScoreTotal: null,
        eloScoreAvgLast30: null,
        eloScoreTotalLast30: null,
        lastPlayedIsoDate: getOffsetDateString(0),
        // Tie/Beat Bot Streak
        currentTieBotStreak: user2PlayedDays.length, // Achieved all played days
        longestTieBotStreak: user2PlayedDays.length, // Achieved all played days
        tieBotStreakDate: user2PlayedDays[user2PlayedDays.length - 1],
        // Puzzle Completed (Win) Streak
        currentPuzzleCompletedStreak: user2PlayedDays.length, // Won all played days
        longestPuzzleCompletedStreak: user2PlayedDays.length, // Won all played days
        puzzleCompletedStreakDate: user2PlayedDays[user2PlayedDays.length - 1], // Date of last win
    }, { merge: true });
    console.log(`Seeded User 2 (${user2Id})`);

    // --- USER 3: User with broken streak (6aA9G...) ---
    const user3Id = '6aA9GFXtGcdGiWho5Q6ffVK9T2G2';
    // Played DATES[0,1,2], skipped DATES[3,4], played DATES[5,6], explicitly lost DATES[6]
    const user3PlayedDays = DATES.slice(0, 3).concat(DATES.slice(5, 7));
    const user3LostDay = DATES[6]; // Explicitly lost this day
    const user3WonDays = user3PlayedDays.filter(d => d !== user3LostDay); // Won on all played except the last one
    const user3GoalAchievedDays = user3WonDays; // Achieved goal only when they won
    const user3FirstTryWinDays = user3WonDays; // Won first try on all winning days

    const user3BestScores = createDateMap(user3WonDays, (d, i) => 15 + i); // Scores 8, 9, 10, 11 on won days
    // *** Create difficulty map for user 3 ***
    const user3Difficulties = createDateMap(user3WonDays, () => DifficultyLevel.Hard); // Example: Always Hard

    await db.collection('userStats').doc(user3Id).set({
        attemptsPerDay: createDateMap(user3PlayedDays, (d) => (d === user3LostDay ? 5 : 1)), // 5 attempts on lost day, 1 otherwise
        bestScoresByDay: user3BestScores,
        bestScoresByDayDifficulty: user3Difficulties, // *** Add difficulty map ***
        goalAchievedDays: user3GoalAchievedDays,
        hintUsageByDay: createDateMap(user3PlayedDays, (d) => (d === user3LostDay ? 2 : 0)), // 2 hints on lost day
        playedDays: user3PlayedDays,
        totalGamesPlayed: user3PlayedDays.length,
        totalHintsUsed: 2,
        totalMovesUsed: user3WonDays.reduce((sum, d, i) => sum + (8 + i) * 1, 0) + (5 * 15), // Estimate moves (15 per attempt on lost day)
        totalWins: user3WonDays.length,
        winsPerDay: createDateMap(user3WonDays, () => 1),
        currentFirstTryStreak: 0, // Broken streak
        longestFirstTryStreak: 3, // Longest was the first 3 days
        firstTryStreakDate: user3WonDays[user3WonDays.length - 1], // Date of *last* first try win (day 5)
        attemptsToAchieveBotScore: createDateMap(user3GoalAchievedDays, () => 1),
        attemptsToBeatBotScore: {}, // Didn't beat bot, remains empty
        goalBeatenDays: [],
        attemptsToWinByDay: createDateMap(user3WonDays, () => 1), // Won on first attempt when they won
        attemptWhenHintUsed: createDateMap(user3PlayedDays, (d) => (d === user3LostDay ? 3 : null)), // Hint on attempt 3 on lost day
        eloScoreByDay: null, //createSampleEloScores(user3PlayedDays), // Add sample Elo scores
        eloScoreAvg: null,
        eloScoreTotal: null,
        eloScoreAvgLast30: null,
        eloScoreTotalLast30: null,
        lastPlayedIsoDate: getOffsetDateString(0),
        // Tie/Beat Bot Streak
        currentTieBotStreak: 0, // Broken streak
        longestTieBotStreak: 3, // Example
        tieBotStreakDate: null,
        // Puzzle Completed (Win) Streak
        currentPuzzleCompletedStreak: 0, // Broken streak (lost last played day)
        longestPuzzleCompletedStreak: 3, // Won first 3 days
        puzzleCompletedStreakDate: user3WonDays[user3WonDays.length - 1], // Date of last win (day 5)
    }, { merge: true });
    console.log(`Seeded User 3 (${user3Id})`);


    // --- Create sample puzzles for all generated DATES ---
    console.log(`Creating/updating sample puzzles for ${DATES.length} dates...`);
    const puzzleBatch = db.batch();
    for (const date of DATES) {
        const puzzleDocRef = db.collection('puzzles').doc(date);
        // Use a simple, consistent puzzle structure for all dates for seeding
        puzzleBatch.set(puzzleDocRef, {
            actions: [101, 41, 88, 147, 56, 60, 81, 67, 42, 78, 0], // Example actions
            algoScore: 12, // Example score
            colorMap: [5, 0, 3, 4, 1, 2], // Example map
            states: [ // Only need initial state for seeding usually
                {
                  0: ["red", "green", "blue", "orange", "red"],
                  1: ["purple", "green", "green", "yellow", "blue"],
                  2: ["yellow", "red", "yellow", "blue", "blue"],
                  3: ["green", "orange", "orange", "red", "blue"],
                  4: ["yellow", "red", "purple", "blue", "orange"]
                },
                // Add more states if needed for testing specific scenarios
            ],
            targetColor: "green"
        }, { merge: true }); // Use merge to update existing puzzles without overwriting everything
    }

    await puzzleBatch.commit();
    console.log('Created/Updated sample puzzles');

    // --- Create Daily Scores ---
    console.log(`Creating/updating dailyScores for ${todayStr}...`);
    // Create the dailyScores document (empty document to hold the subcollection)
    await db.collection('dailyScores').doc(todayStr).set({}, { merge: true });

    // Generate 10 sample users with Firebase-like UIDs
    const userCount = 10;
    const bestScoreUsers = 3;
    const scoresBatch = db.batch();

    console.log('Creating scores subcollection with user documents...');

    for (let i = 1; i <= userCount; i++) {
      // Generate a Firebase-like UID
      const uid = generateMockFirebaseUID();

      let score;
      if (i <= bestScoreUsers) {
        // First 3 players have the best score
        score = 13;
      } else {
        // Other players have random scores between 7 and 15
        score = Math.floor(Math.random() * 9) + 20;
      }

      // Create a document in the scores subcollection for each user
      const scoreDocRef = db.collection('dailyScores').doc(todayStr).collection('scores').doc(uid);
      scoresBatch.set(scoreDocRef, { score }, { merge: true }); // Use merge

      // console.log(`Added user ${i}/${userCount} with score ${score} and ID ${uid}`);
    }

    // Commit all the documents in the batch
    await scoresBatch.commit();

    // Create/Update specific example user documents matching the screenshot
    const exampleUserIds = [
      'SGD12BjUImhOYGfsdrZzJFnj2V12',
      'iN1RwQKXq4NxCItrGnInbGUFjen1',
      '6aA9GFXtGcdGiWho5Q6ffVK9T2G2'
    ];

    for (const uid of exampleUserIds) {
        // Get the best score from the userStats data we just set
        const userStatsDoc = await db.collection('userStats').doc(uid).get();
        const userStatsData = userStatsDoc.data();
        const scoreForToday = userStatsData?.bestScoresByDay?.[todayStr] ?? 15; // Default to 11 if not found

        await db.collection('dailyScores').doc(todayStr).collection('scores').doc(uid).set({
            score: scoreForToday
        }, { merge: true }); // Use merge
        console.log(`Updated example user ${uid} in dailyScores with score ${scoreForToday}`);
    }

    // Verify that the data is properly accessible
    console.log('Verifying data access...');
    const scoresRef = db.collection('dailyScores').doc(todayStr).collection('scores');
    const scoresSnapshot = await scoresRef.get();
    console.log(`Found ${scoresSnapshot.size} documents in scores subcollection`);

    if (scoresSnapshot.size > 0) {
      const allScores = [];
      scoresSnapshot.forEach(doc => {
        const scoreData = doc.data();
        // console.log(`Document ${doc.id}: Score = ${scoreData.score}`);
        if (scoreData && typeof scoreData.score === 'number') {
          allScores.push(scoreData.score);
        }
      });

      // Calculate stats to verify data
      if (allScores.length > 0) {
        const lowestScore = Math.min(...allScores);
        const averageScore = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
        const totalPlayers = allScores.length;
        const playersWithLowestScore = allScores.filter(score => score === lowestScore).length;

        console.log('Calculated stats from verification:');
        console.log(`- Lowest Score: ${lowestScore}`);
        console.log(`- Average Score: ${averageScore.toFixed(1)}`);
        console.log(`- Total Players: ${totalPlayers}`);
        console.log(`- Players with Best Score: ${playersWithLowestScore}`);
      }
    }

    console.log('Created dailyScores collection with proper subcollection structure');
    console.log('Seeding completed successfully');
  }
  catch (error) {
    console.error('Error seeding data:', error);
  }
}

// Function to generate a Firebase-like UID
function generateMockFirebaseUID() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let uid = '';
  for (let i = 0; i < 28; i++) {
    uid += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return uid;
}

// Run the seed function
seedData().then(() => {
  console.log('Done! You can now run your app and test with this data.');
  process.exit(0);
}); 