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

// Generate dates ending today (today and the 10 days before)
const DATES = Array.from({ length: 11 }, (_, i) => getOffsetDateString(i - 10));
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
    console.log('Seeding puzzles, user histories, leaderboards, and daily scores...');

    // 1) Create puzzles for the last 10 days plus today
    console.log(`Creating/updating sample puzzles for ${DATES.length} dates...`);
    const puzzlesByDate = {};
    const puzzleBatch = db.batch();
    for (const date of DATES) {
      const puzzleDocRef = db.collection('puzzles').doc(date);
      const algoScore = 12 + Math.floor(Math.random() * 5) - 2; // 10..14
      const puzzleDoc = {
        actions: [101, 41, 88, 147, 56, 60, 81, 67, 42, 78, 0],
        algoScore,
        colorMap: [5, 0, 3, 4, 1, 2],
        states: [
          {
            0: ["red", "green", "blue", "orange", "red"],
            1: ["purple", "green", "green", "yellow", "blue"],
            2: ["yellow", "red", "yellow", "blue", "blue"],
            3: ["green", "orange", "orange", "red", "blue"],
            4: ["yellow", "red", "purple", "blue", "orange"]
          }
        ],
        targetColor: "green"
      };
      puzzlesByDate[date] = puzzleDoc;
      puzzleBatch.set(puzzleDocRef, puzzleDoc, { merge: true });
    }
    await puzzleBatch.commit();
    console.log('Created/Updated sample puzzles');

    // 2) Generate 10 UIDs
    const userIds = [];
    for (let i = 0; i < 10; i++) userIds.push(generateMockFirebaseUID());
    console.log('Generated user IDs:', userIds);

    // Helper functions
    function computeCurrentStreak(allDates, predicate) {
      let count = 0;
      for (let i = allDates.length - 1; i >= 0; i--) {
        const d = allDates[i];
        if (predicate(d)) count++; else break;
      }
      return count;
    }
    function computeLongestStreak(allDates, predicate) {
      let maxStreak = 0;
      let current = 0;
      for (const d of allDates) {
        if (predicate(d)) { current++; if (current > maxStreak) maxStreak = current; }
        else { current = 0; }
      }
      return maxStreak;
    }

    const userHistories = {}; // uid -> { [date]: { easy?, medium?, hard? } }

    // 3) Create userPuzzleHistory with 20% skip per day and difficulty distribution
    for (const uid of userIds) {
      userHistories[uid] = {};
      for (const date of DATES) {
        // 20% chance to skip (user didn't play)
        if (Math.random() < 0.2) continue;

        // Difficulty presence distribution
        const r = Math.random();
        let hasEasy = false, hasMedium = false, hasHard = false;
        if (r < 0.5) { // 50% only hard
          hasHard = true;
        } else if (r < 0.7) { // 20% only medium
          hasMedium = true;
        } else if (r < 0.8) { // 10% only easy
          hasEasy = true;
        } else if (r < 0.9) { // 10% hard + medium
          hasHard = true; hasMedium = true;
        } else { // 10% hard + medium + easy
          hasHard = true; hasMedium = true; hasEasy = true;
        }

        const algo = puzzlesByDate[date].algoScore;
        const docData = {};
        let anyHintUsed = false;
        let totalAttempts = 0;

        if (hasEasy) {
          const attempts = 1 + Math.floor(Math.random() * 4); // 1..4
          const firstTry = Math.random() < 0.35;
          const hintUsedEasy = Math.random() < 0.2;
          anyHintUsed = anyHintUsed || hintUsedEasy;
          const moves = 10 + Math.floor(Math.random() * 10) + (attempts - 1) * 5;
          const eloScore = 60 + Math.floor(Math.random() * 60); // 60..119
          const tie = moves <= algo;
          const beat = moves < algo;
          const easyObj = {
            attemptNumber: attempts,
            moves,
            firstTry,
            goalAchieved: tie,
            puzzleCompleted: true,
            eloScore,
            ...(tie ? { attemptToTieBot: attempts } : {}),
            ...(beat ? { attemptToBeatBot: attempts } : {}),
          };
          docData.easy = easyObj;
          totalAttempts += attempts;
        }

        if (hasMedium) {
          const attempts = 1 + Math.floor(Math.random() * 4);
          const firstTry = Math.random() < 0.25;
          const hintUsedMedium = Math.random() < 0.2;
          anyHintUsed = anyHintUsed || hintUsedMedium;
          const moves = 12 + Math.floor(Math.random() * 12) + (attempts - 1) * 6;
          const eloScore = 70 + Math.floor(Math.random() * 60); // 70..129
          const tie = moves <= algo;
          const beat = moves < algo;
          const mediumObj = {
            attemptNumber: attempts,
            moves,
            firstTry,
            eloScore,
            ...(tie ? { attemptToTieBot: attempts } : {}),
            ...(beat ? { attemptToBeatBot: attempts } : {}),
          };
          docData.medium = mediumObj;
          totalAttempts += attempts;
        }

        if (hasHard) {
          const attempts = 1 + Math.floor(Math.random() * 5);
          const firstTry = Math.random() < 0.15;
          const hintUsedHard = Math.random() < 0.25;
          anyHintUsed = anyHintUsed || hintUsedHard;
          const moves = 14 + Math.floor(Math.random() * 14) + (attempts - 1) * 7;
          const eloScore = 80 + Math.floor(Math.random() * 60); // 80..139
          const tie = moves <= algo;
          const beat = moves < algo;
          const firstToBeatBot = Math.random() < 0.1;
          const hardObj = {
            attemptNumber: attempts,
            moves,
            firstTry,
            eloScore,
            firstToBeatBot,
            ...(tie ? { attemptToTieBot: attempts } : {}),
            ...(beat ? { attemptToBeatBot: attempts } : {}),
          };
          docData.hard = hardObj;
          totalAttempts += attempts;
        }

        // Add top-level puzzle fields
        docData.totalAttempts = totalAttempts;
        docData.hintUsed = anyHintUsed;

        // Persist history doc using user/{uid}/puzzles/{date}
        const historyDocRef = db.collection('userPuzzleHistory').doc(uid).collection('puzzles').doc(date);
        await historyDocRef.set(docData);
        userHistories[uid][date] = docData;
      }
    }

    // 4) Attach per-difficulty leaderboard stats under userPuzzleHistory/{uid}
    for (const uid of userIds) {
      const historyByDate = userHistories[uid];
      const datesPlayed = DATES.filter(d => !!historyByDate[d]);

      function goalsAchievedPredicate(difficulty) {
        return (d) => {
          const e = historyByDate[d]?.[difficulty];
          if (!e) return false;
          const algo = puzzlesByDate[d].algoScore;
          return e.moves <= algo;
        };
      }
      function firstTryPredicate(difficulty) {
        return (d) => {
          const e = historyByDate[d]?.[difficulty];
          return !!(e && e.firstTry);
        };
      }

      function buildDifficultyStats(difficulty) {
        const daysWithDiff = DATES.filter(d => !!historyByDate[d]?.[difficulty]);
        const goalsAchievedDays = daysWithDiff.filter(goalsAchievedPredicate(difficulty));
        const goalsBeatenDays = daysWithDiff.filter(d => {
          const e = historyByDate[d]?.[difficulty];
          const algo = puzzlesByDate[d].algoScore;
          return !!(e && e.moves < algo);
        });
        const currentTieBotStreak = computeCurrentStreak(DATES, (d) => goalsAchievedDays.includes(d));
        const longestTieBotStreak = computeLongestStreak(DATES, (d) => goalsAchievedDays.includes(d));
        const lastTieBotDate = goalsAchievedDays.length ? goalsAchievedDays[goalsAchievedDays.length - 1] : null;

        const goalAchievedDate = goalsAchievedDays.length ? goalsAchievedDays[goalsAchievedDays.length - 1] : null;
        const goalBeatenDate = goalsBeatenDays.length ? goalsBeatenDays[goalsBeatenDays.length - 1] : null;

        const firstTryDays = daysWithDiff.filter(firstTryPredicate(difficulty));
        const currentFirstTryStreak = computeCurrentStreak(DATES, (d) => firstTryDays.includes(d));
        const longestFirstTryStreak = computeLongestStreak(DATES, (d) => firstTryDays.includes(d));
        const lastFirstTryDate = firstTryDays.length ? firstTryDays[firstTryDays.length - 1] : null;

        return {
          goalsBeaten: goalsBeatenDays.length,
          goalsAchieved: goalsAchievedDays.length,
          goalAchievedDate,
          goalBeatenDate,
          currentFirstTryStreak,
          lastFirstTryDate,
          longestFirstTryStreak,
          currentTieBotStreak,
          lastTieBotDate,
          longestTieBotStreak
        };
      }

      // Level-agnostic aggregates
      let puzzleAttempts = 0;
      let moves = 0;
      for (const d of datesPlayed) {
        const entry = historyByDate[d];
        if (entry.easy) { puzzleAttempts += entry.easy.attemptNumber; moves += entry.easy.moves; }
        if (entry.medium) { puzzleAttempts += entry.medium.attemptNumber; moves += entry.medium.moves; }
        if (entry.hard) { puzzleAttempts += entry.hard.attemptNumber; moves += entry.hard.moves; }
      }
      const levelAgnostic = {
        puzzleAttempts,
        moves,
        puzzlesSolved: datesPlayed.length,
        currentPuzzlesCompletedStreak: computeCurrentStreak(DATES, (d) => datesPlayed.includes(d)),
        lastPuzzleCompletedDate: datesPlayed.length ? datesPlayed[datesPlayed.length - 1] : null,
        longestPuzzlesCompletedStreak: computeLongestStreak(DATES, (d) => datesPlayed.includes(d))
      };

      const leaderboardEasy = buildDifficultyStats('easy');
      const leaderboardMedium = buildDifficultyStats('medium');
      const leaderboardHard = buildDifficultyStats('hard');

      // Compute Elo aggregates from daily best elo across difficulties
      const eloScoreByDay = {};
      for (const d of datesPlayed) {
        const e = historyByDate[d];
        const elos = [];
        if (e.easy && typeof e.easy.eloScore === 'number') elos.push(e.easy.eloScore);
        if (e.medium && typeof e.medium.eloScore === 'number') elos.push(e.medium.eloScore);
        if (e.hard && typeof e.hard.eloScore === 'number') elos.push(e.hard.eloScore);
        if (elos.length > 0) eloScoreByDay[d] = Math.max(...elos);
      }
      let eloScoreAllTime = 0;
      let eloScoreLast30 = 0;
      let eloScoreLast7 = 0;
      const now = new Date();
      const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const start30 = new Date(todayUTC); start30.setUTCDate(start30.getUTCDate() - 29);
      const start7 = new Date(todayUTC); start7.setUTCDate(start7.getUTCDate() - 6);
      for (const [dayStr, val] of Object.entries(eloScoreByDay)) {
        if (typeof val !== 'number' || isNaN(val)) continue;
        eloScoreAllTime += val;
        try {
          const parts = dayStr.split('-');
          if (parts.length === 3) {
            const dUTC = Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            const dDate = new Date(dUTC);
            if (!isNaN(dDate.getTime())) {
              if (dDate >= start30) eloScoreLast30 += val;
              if (dDate >= start7) eloScoreLast7 += val;
            }
          }
        } catch {}
      }
      const leaderboardCol = db.collection('userPuzzleHistory').doc(uid).collection('leaderboard');
      await leaderboardCol.doc('levelAgnostic').set({
        ...levelAgnostic,
        eloScoreByDay,
        eloScoreAllTime,
        eloScoreLast30,
        eloScoreLast7,
      }, { merge: true });
      await leaderboardCol.doc('easy').set(leaderboardEasy, { merge: true });
      await leaderboardCol.doc('medium').set(leaderboardMedium, { merge: true });
      await leaderboardCol.doc('hard').set(leaderboardHard, { merge: true });
    }

    // 5) Create dailyScoresV2 (per-difficulty) for all dates
    console.log('Creating/updating dailyScoresV2 for all puzzle dates...');
    for (const date of DATES) {
      const easyMap = {};
      const mediumMap = {};
      const hardMap = {};
      for (const uid of userIds) {
        const entry = userHistories[uid][date];
        if (!entry) continue; // user didn't play this date
        if (entry.easy && typeof entry.easy.moves === 'number') {
          easyMap[uid] = entry.easy.moves;
        }
        if (entry.medium && typeof entry.medium.moves === 'number') {
          mediumMap[uid] = entry.medium.moves;
        }
        if (entry.hard && typeof entry.hard.moves === 'number') {
          hardMap[uid] = entry.hard.moves;
        }
      }
      const update = {};
      if (Object.keys(easyMap).length) update.easy = easyMap;
      if (Object.keys(mediumMap).length) update.medium = mediumMap;
      if (Object.keys(hardMap).length) update.hard = hardMap;
      if (Object.keys(update).length) {
        await db.collection('dailyScoresV2').doc(date).set(update, { merge: true });
      }
    }

    // Verify counts for today's hard entries in dailyScoresV2
    console.log('Verifying dailyScoresV2 (hard) map for today...');
    const v2Doc = await db.collection('dailyScoresV2').doc(todayStr).get();
    const v2Data = v2Doc.exists ? (v2Doc.data() || {}) : {};
    const hardCount = v2Data && v2Data.hard ? Object.keys(v2Data.hard).length : 0;
    console.log(`Found ${hardCount} hard entries in dailyScoresV2 for ${todayStr}`);

    console.log('Created dailyScoresV2 collections with per-difficulty structure');
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