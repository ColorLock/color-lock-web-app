# Color Lock Web App - TODO List

## 1. Sharing Functionality

**Task**: Implement ability to share in a variety of ways

**Implementation Details**:
- Add Web Share API integration for modern browsers
- Create a shareable link with URL parameters that encode the current game state
- Include the following share options:
  - ~~Copy to clipboard (example format below, tiles should reflect initial state of daily puzzle):
    Color Lock - 3/12/2025
    Target: 🟧
    
    Score: 10 moves 🏅
    
    Today's Board:
    🟥🟨🟨🟪🟩
    🟪🟧🟪🟪🟥
    🟩🟩🟩🟦🟧
    🟨🟦🟥🟩🟧
    🟥🟥🟩🟦🟧~~
  - Share to Twitter/X
  - Share to Facebook
  - Share via Email
- Implement fallbacks for browsers that don't support Web Share API
- ~~Location: Update the share button in the win modal (`App.tsx` around line ~850)~~
- Add share icon/options to the UI

## 2. Improve Hint System

**Task**: Fix Get Hint so it doesn't lead to losing states

**Implementation Details**:
- Modify the `handleHint` function in `App.tsx` to ensure suggested moves don't lead to failure
- In the `computeActionDifference` function (in `hints.tsx`), enhance the check that returns `-999999` for losing states
- Add logic to analyze potential future states to avoid suggesting moves that lead to a dead end
- Test thoroughly with different game states, especially edge cases
- Update the hint visualization to make it more clear which tile should be changed

## 3. Tutorial Implementation vs. Hints

**Task**: Evaluate need for tutorial based on hint effectiveness and implement if necessary

**Implementation Details**:
- Research question: Are hints sufficient for new users to learn the game?
- If tutorial needed:
  - Add user identification:
    - Use localStorage to track first-time visits
    - Add optional Firebase Auth user tracking
    - Implement IP-based tracking as fallback (using a service like ipify API)
  - Create a step-by-step tutorial overlay that explains:
    - Game objective
    - How color flooding works
    - What locked regions mean
    - How to win
  - Implement tutorial skip/dismiss option that remembers user preference
- Suggested implementation: Create a new `Tutorial.tsx` component with overlay UI

~~## 4. Settings Panel

**Task**: Add settings button with color accessibility and region toggles

**Implementation Details**:
- Create a new `SettingsModal.tsx` component
- Add a settings gear icon in the top right corner of the app
- Include the following settings:
  - Color accessibility options:
    - High contrast mode
    - Color blindness presets (Protanopia, Deuteranopia, Tritanopia)
    - Custom color scheme option
  - Toggle for highlighting largest region (on/off)
  - Toggle for animations/effects
  - Sound effects toggle
  - toggle for locked region counter (on/off)
- Save user preferences in localStorage
- Ensure all settings follow accessibility best practices~~

## 5. Statistics Dashboard

**Task**: Create stats popup with daily and all-time statistics

**Implementation Details**:
- Create a new `StatsModal.tsx` component
- Add a stats icon button next to the settings button
- Display the following statistics:
  - Today's game:
    - Moves used
    - Best score (if multiple attempts)
    - Time spent solving
  - All-time stats:
    - Games played
    - Win percentage
    - Average moves per solve
    - Best score ever
    - Streak of consecutive days played
- Add visualization of stats (mini charts/graphs plotted over time)
- Save statistics in localStorage and optionally sync with Firebase if user account exists
- Add share stats feature to the stats modal

## 6. Loading Screen Branding

**Task**: Add Banana Standard logo to loading screen

**Implementation Details**:
- Create/source the Banana Standard logo
- Enhance the loading UI in `App.tsx` (around line ~332)
- Replace the simple "Loading puzzle..." text with a branded loading experience
- Add a subtle animation to the logo during loading
- Optimize the loading screen to display quickly before the full app loads

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

## 8. Enhance Win Popup

**Task**: Improve game won popup with countdown and visual effects

**Implementation Details**:
- Enhance the existing win modal in `App.tsx` (around line ~830)
- Fix the countdown timer logic to accurately show time until next puzzle
- Add visual celebration effects:
  - Add confetti/streamers animation using a library like `react-confetti`
  - Include subtle sound effect (with respect to sound settings)
  - Add a background color pulse or gradient animation
- Make the modal more visually appealing with better typography and spacing
- Display additional win statistics in the modal

## 9. Autocomplete Feature

**Task**: Add autocomplete functionality

**Implementation Details**:
- Implement an AI or algorithm-based suggestion system for next moves
- Add an "Autocomplete" button that finishes the puzzle automatically
- Consider showing a slider to control how many moves are autocompleted
- Only enable this feature after the user has made a minimum number of moves
- Add animations to show the autocompleted moves in sequence
- Consider limiting this feature to prevent overuse (e.g., once per day)

## 10. Color Picker Enhancement

**Task**: Improve color picker modal to dismiss when clicking outside

**Implementation Details**:
- Modify the `ColorPickerModal` component in `App.tsx`
- Add click outside detection using a ref and event listener
- Keep the Cancel button as a fallback
- Ensure mobile touch events are also properly handled
- Add subtle animations for opening/closing the picker
- Test thoroughly across different devices and browsers

## 11. Fix Failure Conditions

**Task**: Fix failure condition for locking too many non-target colors

**Implementation Details**:
- Review current logic in `handleColorSelect` function in `App.tsx`
- Fix the condition that checks for too many locked tiles (around line ~432)
- Ensure proper messaging when this failure occurs
- Add a visual indicator showing how close the user is to locking too many tiles
- Consider adding a warning when a move might lead to this failure condition
- Test edge cases thoroughly

---

## Priority Order (Suggested)
1. Fix Failure Conditions (#11) - Critical game mechanic issue
2. Firebase Security (#7) - Important for production use
3. Fix Color Picker Dismissal (#10) - Simple UX improvement
4. Enhance Win Popup (#8) - Improves user satisfaction
5. Improve Hint System (#2) - Core gameplay improvement
6. Sharing Functionality (#1) - Drives user acquisition
7. Statistics Dashboard (#5) - Increases retention
8. Settings Panel (#4) - Improves accessibility
9. Loading Screen Branding (#6) - Visual enhancement
10. Tutorial Evaluation (#3) - UX improvement
11. Autocomplete Feature (#9) - Nice-to-have feature 