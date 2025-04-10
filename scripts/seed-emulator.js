const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin without service account - this works with emulators
admin.initializeApp({
  projectId: 'color-lock-prod'
});

// Connect to emulators
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

const db = admin.firestore();

// Get today's date in YYYY-MM-DD format for the puzzle ID - using local date instead of UTC
function getLocalDateString() {
  const now = new Date();
  // Format using local time components
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Check if a date was provided as a command line argument
const dateArg = process.argv[2]; // e.g., node seed-emulator.js 2023-05-15
// Use the provided date or today's date
const todayStr = dateArg || getLocalDateString();
console.log(`Seeding data for date: ${todayStr} ${dateArg ? '(from command line argument)' : '(using local machine date)'}`);

// Create sample data
async function seedData() {
  try {
    console.log('Seeding data for date:', todayStr);

    await db.collection('userStats').doc('SGD12BjUImhOYGfsdrZzJFnj2V12').set({
      attemptsPerDay: {
        "2025-03-24": 5,
        "2025-03-25": 2,
        "2025-03-26": 4,
        "2025-03-27": 2,
        "2025-03-28": 4,
        "2025-03-29": 1,
        "2025-03-31": 1,
        "2025-04-01": 2,
        "2025-04-02": 1,
        "2025-04-03": 7,
        "2025-04-04": 2
      },
      bestScoresByDay: {
        "2025-03-24": 11,
        "2025-03-25": 9,
        "2025-03-26": 11,
        "2025-03-27": 13,
        "2025-03-28": 7,
        "2025-03-29": 10,
        "2025-03-31": 9,
        "2025-04-01": 10,
        "2025-04-02": 9,
        "2025-04-03": 10,
        "2025-04-04": 10
      },
      currentStreak: 5,
      goalAchievedDays: [
        "2025-03-28",
        "2025-03-31",
        "2025-03-26",
        "2025-03-29",
        "2025-04-04",
        "2025-04-02",
        "2025-04-01",
        "2025-04-03",
        "2025-03-25",
        "2025-03-24"
      ],
      hintUsageByDay: {
        "2025-03-24": 0,
        "2025-03-25": 0,
        "2025-03-26": 1,
        "2025-03-27": 0,
        "2025-03-28": 0,
        "2025-03-29": 0,
        "2025-03-31": 0,
        "2025-04-01": 0,
        "2025-04-02": 0,
        "2025-04-03": 1,
        "2025-04-04": 0
      },
      lastStreakDate: "2025-04-04",
      longestStreak: 5,
      playedDays: [
        "2025-04-02",
        "2025-03-27",
        "2025-03-28",
        "2025-04-03",
        "2025-04-01",
        "2025-03-26",
        "2025-03-25",
        "2025-03-31",
        "2025-03-29",
        "2025-03-24",
        "2025-04-04"
      ],
      totalGamesPlayed: 31,
      totalHintsUsed: 3,
      totalMovesUsed: 236,
      totalWins: 21,
      winsPerDay: {
        "2025-03-24": 1,
        "2025-03-25": 2,
        "2025-03-26": 4,
        "2025-03-27": 1,
        "2025-03-28": 4,
        "2025-03-29": 1,
        "2025-03-31": 1,
        "2025-04-01": 1,
        "2025-04-02": 1,
        "2025-04-03": 4,
        "2025-04-04": 1
      },
      firstTryStreak: 0,
      longestFirstTryStreak: 2,
      attemptsToAchieveBotScore: {
        "2025-03-24": 5,
        "2025-03-25": 2,
        "2025-03-26": 4,
        "2025-03-27": 2,
        "2025-03-28": 4,
        "2025-03-29": 1,
        "2025-03-31": 1,
        "2025-04-01": 2,
        "2025-04-02": 1,
        "2025-04-03": 7,
        "2025-04-04": 2
      }
    });
    
    // Create a sample puzzle document
    await db.collection('puzzles').doc(todayStr).set({
      actions: [101, 41, 88, 147, 56, 60, 81, 67, 42, 78, 0],
      algoScore: 11,
      colorMap: [5, 0, 3, 4, 1, 2],
      states: [
        {
          0: ["red", "green", "blue", "orange", "red"],
          1: ["purple", "green", "green", "yellow", "blue"],
          2: ["yellow", "red", "yellow", "blue", "blue"],
          3: ["green", "orange", "orange", "red", "blue"],
          4: ["yellow", "red", "purple", "blue", "orange"]
        },
        {
          0: ["red", "red", "blue", "orange", "red"],
          1: ["purple", "red", "red", "yellow", "blue"],
          2: ["yellow", "red", "yellow", "blue", "blue"],
          3: ["green", "orange", "orange", "red", "blue"],
          4: ["yellow", "red", "purple", "blue", "orange"]
        },
        {
          0: ["red", "red", "blue", "orange", "red"],
          1: ["purple", "red", "red", "yellow", "blue"],
          2: ["yellow", "red", "yellow", "blue", "blue"],
          3: ["green", "red", "red", "red", "blue"],
          4: ["yellow", "red", "purple", "blue", "orange"]
        },
        {
          0: ["red", "red", "blue", "orange", "red"],
          1: ["purple", "red", "red", "yellow", "yellow"],
          2: ["yellow", "red", "yellow", "yellow", "yellow"],
          3: ["green", "red", "red", "red", "yellow"],
          4: ["yellow", "red", "purple", "blue", "orange"]
        },
        {
          0: ["red", "red", "blue", "orange", "blue"],
          1: ["purple", "red", "red", "yellow", "yellow"],
          2: ["yellow", "red", "yellow", "yellow", "yellow"],
          3: ["green", "red", "red", "red", "yellow"],
          4: ["yellow", "red", "purple", "blue", "orange"]
        },
        {
          0: ["red", "red", "blue", "orange", "blue"],
          1: ["purple", "red", "red", "orange", "orange"],
          2: ["yellow", "red", "orange", "orange", "orange"],
          3: ["green", "red", "red", "red", "orange"],
          4: ["yellow", "red", "purple", "blue", "orange"]
        },
        {
          0: ["red", "red", "blue", "orange", "blue"],
          1: ["purple", "red", "red", "orange", "orange"],
          2: ["green", "red", "orange", "orange", "orange"],
          3: ["green", "red", "red", "red", "orange"],
          4: ["yellow", "red", "purple", "blue", "orange"]
        },
        {
          0: ["red", "red", "blue", "blue", "blue"],
          1: ["purple", "red", "red", "blue", "blue"],
          2: ["green", "red", "blue", "blue", "blue"],
          3: ["green", "red", "red", "red", "blue"],
          4: ["yellow", "red", "purple", "blue", "blue"]
        },
        {
          0: ["purple", "purple", "blue", "blue", "blue"],
          1: ["purple", "purple", "purple", "blue", "blue"],
          2: ["green", "purple", "blue", "blue", "blue"],
          3: ["green", "purple", "purple", "purple", "blue"],
          4: ["yellow", "purple", "purple", "blue", "blue"]
        },
        {
          0: ["green", "green", "blue", "blue", "blue"],
          1: ["green", "green", "green", "blue", "blue"],
          2: ["green", "green", "blue", "blue", "blue"],
          3: ["green", "green", "green", "green", "blue"],
          4: ["yellow", "green", "green", "blue", "blue"]
        },
        {
          0: ["green", "green", "green", "green", "green"],
          1: ["green", "green", "green", "green", "green"],
          2: ["green", "green", "green", "green", "green"],
          3: ["green", "green", "green", "green", "green"],
          4: ["yellow", "green", "green", "green", "green"]
        },
        {
          0: ["green", "green", "green", "green", "green"],
          1: ["green", "green", "green", "green", "green"],
          2: ["green", "green", "green", "green", "green"],
          3: ["green", "green", "green", "green", "green"],
          4: ["green", "green", "green", "green", "green"]
        }
      ],
      targetColor: "green"
    });
    
    console.log('Created sample puzzle');
    
    // Create the dailyScores document (empty document to hold the subcollection)
    await db.collection('dailyScores').doc(todayStr).set({});
    
    // Generate 10 sample users with Firebase-like UIDs
    const userCount = 10;
    const bestScoreUsers = 3;
    const batch = db.batch();
    
    console.log('Creating scores subcollection with user documents...');
    
    for (let i = 1; i <= userCount; i++) {
      // Generate a Firebase-like UID
      const uid = generateMockFirebaseUID();
      
      let score;
      if (i <= bestScoreUsers) {
        // First 3 players have the best score
        score = 6;
      } else {
        // Other players have random scores between 7 and 15
        score = Math.floor(Math.random() * 9) + 7;
      }
      
      // Create a document in the scores subcollection for each user
      const scoreDocRef = db.collection('dailyScores').doc(todayStr).collection('scores').doc(uid);
      batch.set(scoreDocRef, { score });
      
      console.log(`Added user ${i}/${userCount} with score ${score} and ID ${uid}`);
    }
    
    // Commit all the documents in the batch
    await batch.commit();
    
    // Create a couple specific example user documents matching the screenshot
    // This ensures we have at least one document that looks exactly like the one in the screenshot
    const exampleUserIds = [
      'SGD12BjUImhOYGfsdrZzJFnj2V12',
      'iN1RwQKXq4NxCItrGnInbGUFjen1',
      '6aA9GFXtGcdGiWho5Q6ffVK9T2G2'
    ];
    
    for (const uid of exampleUserIds) {
      await db.collection('dailyScores').doc(todayStr).collection('scores').doc(uid).set({
        score: 11
      });
      console.log(`Added example user with ID ${uid} and score 11`);
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
        console.log(`Document ${doc.id}: Score = ${scoreData.score}`);
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
  } catch (error) {
    console.error('Error seeding data:', error);
  }
}

// Function to generate a Firebase-like UID
function generateMockFirebaseUID() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let uid = '';
  
  // Firebase UIDs are typically 28 characters
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