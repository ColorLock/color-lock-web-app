#!/bin/bash

# Colors for prettier output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Firebase Function Debugging Setup ===${NC}"

# Step 1: Install node-fetch if not already installed
echo -e "${YELLOW}Checking for node-fetch...${NC}"
if ! npm list node-fetch > /dev/null 2>&1; then
  echo -e "${YELLOW}Installing node-fetch...${NC}"
  npm install --save-dev node-fetch@2
fi

# Step 2: Make sure code is compiled
echo -e "${YELLOW}Compiling TypeScript files...${NC}"
(cd functions && npm run build)

# Step 3: Start the emulators in debug mode
echo -e "${YELLOW}Starting Firebase emulators in debug mode...${NC}"
echo -e "${YELLOW}Important: Attach VS Code debugger to port 9229${NC}"
./scripts/start-debug-emulators.sh &

# Store the emulator PID
EMULATOR_PID=$!

# Wait for emulators to start
echo -e "${BLUE}Waiting for emulators to start (15 seconds)...${NC}"
sleep 15

# Step 4: Seed the emulator with the existing seed script
echo -e "${YELLOW}Seeding the Firebase emulator with test data...${NC}"
node scripts/seed-emulator.js

# Wait for data to be properly stored
echo -e "${BLUE}Waiting for seed data to be processed (5 seconds)...${NC}"
sleep 5

# Step 5: Prepare for debugging
echo -e "${BLUE}Ready to debug - Follow these steps:${NC}"
echo -e "${GREEN}1. Set a breakpoint at line 511 in functions/src/index.ts${NC}"
echo -e "${GREEN}2. Start the 'Debug Firebase Functions' debug configuration${NC}"
echo -e "${GREEN}3. Once debugger is attached, press any key to continue${NC}"
echo -e "${GREEN}4. The script will trigger the function and hit your breakpoint${NC}"

read -n 1 -s -r -p "Press any key when debugger is attached..."
echo ""

# Step 6: Trigger the function
echo -e "${YELLOW}Triggering the getDailyScoresStats function...${NC}"
node scripts/trigger-daily-scores-stats.js

echo -e "${YELLOW}Function triggered. The debugger should have paused at your breakpoint.${NC}"
echo -e "${BLUE}Press Ctrl+C when you're done debugging${NC}"

# Keep the script running until Ctrl+C
wait $EMULATOR_PID

# Cleanup when script exits
echo -e "${YELLOW}Cleaning up...${NC}"
kill $EMULATOR_PID 2>/dev/null || true 