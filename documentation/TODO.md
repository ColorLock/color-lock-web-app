# Color Lock Web App - TODO List

1) Fix bug that shows confetti when user chooses difficulty
2) 






## 7. Firebase Security

**Task**: Secure Firestore database connection in production

**Implementation Details**:
- Current issue: Using debug token for Firebase connection
- Implement proper Firebase App Check:
  - Add reCAPTCHA v3 verification for web clients
  - Set up proper security rules in Firebase console
  - Move Firebase API keys to environment variables
  - Use `.env` files for local development and proper environment config in production
- Update the Firebase initialization in `firebase_client.tsx`
- Test the secure connection thoroughly
- Consider implementing rate limiting for API calls


---
# Before Marketing

1) Build Tutorial
2) Implement User Authentication
3) Data Capture For Eventual Stats
  - user_id: {
      puzzle_id: {
        scores: [int],
        unique_bot_min_paths: this is all the ways the user found to tie or beat the bot
      }
    }
4) Figure out CORS problem
5) Should we store users preferred settings in firebase?
6) Analytics functionality to view overall user trends
  - How many individual users played today
  - how many total tries were there
  - tries per user
  - how many people tied or beat the bot on hard, medium, easy
  - should we track these for guests?

# Tech Debt
1) unit tests
2) Facebook share doesn't automatically fill out share
3) Figure out different environments for testing purposes
  - Use subdomains for this
  - Need to implement improvements in the code to work within each environment seamlessly
4) Add link to new colorlock domain on bananastandard website
5) Fix getHint functionality so it doesn't suggest you enter a losing state
6) Fix colorblind functionalities
7) Add sound functionality
8) Improve loading screen branding


# Future features
1) Robust Stats
  - Total moves made across all games
  - Current win streak and longest win streak
  - Total time played (in minutes/hours)
  - First try success rate (percentage of games won on first attempt)
  - chart that show stats over time
