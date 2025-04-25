#!/bin/bash

# Stop on errors
set -e

# Colors for prettier output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if port is in use
check_port() {
  lsof -i:$1 > /dev/null 2>&1
  return $?
}

# Function to clean up previous emulators
cleanup_previous() {
  echo -e "${YELLOW}Checking for existing emulators...${NC}"
  
  # Check for Firebase emulator processes
  if pgrep -f "firebase emulators" > /dev/null; then
    echo -e "${YELLOW}Found existing Firebase emulator processes...${NC}"
    pkill -f "firebase emulators" || true
    echo -e "${GREEN}Stopped Firebase emulator processes.${NC}"
  fi
  
  # Check for Java emulator processes
  if pgrep -f "java.*emulator" > /dev/null; then
    echo -e "${YELLOW}Found existing Java emulator processes...${NC}"
    pkill -f "java.*emulator" || true
    echo -e "${GREEN}Stopped Java emulator processes.${NC}"
  fi
  
  # Check common emulator ports
  PORTS_TO_CHECK=(8080 9099 5001 4400 4000 4500 9150 5000 9000 8085 4438)
  PORTS_IN_USE=()
  
  for PORT in "${PORTS_TO_CHECK[@]}"; do
    if check_port $PORT; then
      PORTS_IN_USE+=($PORT)
      echo -e "${YELLOW}Found process using port $PORT${NC}"
    fi
  done
  
  if [ ${#PORTS_IN_USE[@]} -gt 0 ]; then
    echo -e "${YELLOW}Forcefully stopping processes on ports: ${PORTS_IN_USE[@]}${NC}"
    for PORT in "${PORTS_IN_USE[@]}"; do
      # Get PID of process using this port
      PID=$(lsof -t -i:$PORT 2>/dev/null || true)
      if [ ! -z "$PID" ]; then
        echo -e "${YELLOW}Killing process $PID using port $PORT${NC}"
        kill -9 $PID 2>/dev/null || true
      fi
    done
    
    # Final fallback if specific process killing didn't work
    echo -e "${YELLOW}Final cleanup of any remaining emulator processes...${NC}"
    killall -9 java node 2>/dev/null || true
    
    sleep 3
    echo -e "${GREEN}Cleaned up previous emulators.${NC}"
  else
    echo -e "${GREEN}No existing emulators found on checked ports.${NC}"
  fi
  
  # Wait a moment to ensure ports are released
  sleep 2
}

# Function to handle cleanup on exit
handle_exit() {
  echo -e "\n${BLUE}Cleaning up...${NC}"
  # Kill the emulator process
  kill $EMULATOR_PID 2>/dev/null || true
  echo -e "${GREEN}Emulators stopped.${NC}"
  exit 0
}

# Set trap for clean exit
trap handle_exit INT TERM EXIT

# Clean up any previous emulator instances
cleanup_previous

echo -e "${BLUE}Building functions...${NC}"
(cd functions && npm run build) # Run build in subshell
if [ $? -ne 0 ]; then
  echo -e "${RED}Functions build failed!${NC}"
  exit 1
fi
echo -e "${GREEN}Functions built successfully.${NC}"

echo -e "${BLUE}=== Starting Firebase Emulators ===${NC}"
echo -e "${BLUE}Project: color-lock-prod${NC}"
echo -e "${YELLOW}IMPORTANT: The frontend must connect to project 'color-lock-prod' in region 'us-central1'${NC}"

# Start Firebase emulators in the background
firebase emulators:start --only auth,functions,firestore,pubsub --project color-lock-prod --inspect-functions &

# Store the emulator process ID
EMULATOR_PID=$!

# Wait for emulators to start
echo -e "${BLUE}Waiting for emulators to start (15 seconds)...${NC}"
sleep 15

# Check if emulators are running
if ! ps -p $EMULATOR_PID > /dev/null; then
  echo -e "${RED}Emulators failed to start. Check for port conflicts.${NC}"
  exit 1
fi

# Seed data
echo -e "${BLUE}=== Seeding Test Data ===${NC}"
echo -e "${YELLOW}The seeding script will use project ID: color-lock-prod${NC}"
node scripts/seed-emulator.js

# Check if seed was successful
if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to seed test data. Check the error logs above.${NC}"
  kill $EMULATOR_PID
  exit 1
else
  echo -e "${GREEN}Successfully seeded test data to Firestore emulator.${NC}"
  echo -e "${YELLOW}You should now see data in the getDailyScoresStats function responses.${NC}"
fi

# Set PUBSUB_EMULATOR_HOST for convenience in this terminal session
export PUBSUB_EMULATOR_HOST=localhost:8085
echo -e "${BLUE}Set PUBSUB_EMULATOR_HOST=${PUBSUB_EMULATOR_HOST} for this terminal session${NC}"

# Notify user
echo -e "\n${GREEN}=== Setup Complete! ===${NC}"
echo -e "Firebase emulators are running with test data."
echo -e "Emulator UI: ${BLUE}http://localhost:4000${NC}"
echo -e "You can now run your app with:"
echo -e "${BLUE}npm run dev${NC}"
echo -e "\nTo trigger scheduled functions, run:"
echo -e "${BLUE}npm run trigger:elo:emulator${NC} or ${BLUE}npm run trigger:leaderboard:emulator${NC}"
echo -e "\nPress Ctrl+C to stop the emulators when done testing."

# Keep script running until Ctrl+C
wait $EMULATOR_PID 