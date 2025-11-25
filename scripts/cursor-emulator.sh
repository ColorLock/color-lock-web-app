#!/bin/bash

# Color Lock - Firebase Emulator Startup Script
# This script starts the Firebase emulators, builds functions, and seeds test data.
#
# Usage:
#   npm run cursor-dev
#   OR
#   ./scripts/cursor-emulator.sh

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Kill any existing emulator processes
cleanup() {
  log_info "Cleaning up existing emulator processes..."
  pkill -f "firebase emulators" 2>/dev/null || true
  pkill -f "java.*emulator" 2>/dev/null || true
  sleep 2
}

# Handle script exit
handle_exit() {
  echo ""
  log_info "Shutting down emulators..."
  kill $EMULATOR_PID 2>/dev/null || true
  log_success "Emulators stopped."
  exit 0
}

trap handle_exit INT TERM

# Step 1: Cleanup
cleanup

# Step 2: Build functions
log_info "Building Cloud Functions..."
(cd functions && npm run build)
if [ $? -ne 0 ]; then
  log_error "Functions build failed!"
  exit 1
fi
log_success "Functions built successfully."

# Step 3: Start emulators
log_info "Starting Firebase Emulators..."
firebase emulators:start \
  --only auth,functions,firestore \
  --project color-lock-prod \
  --import=./firebase-emulator-data \
  --export-on-exit=./firebase-emulator-data &

EMULATOR_PID=$!

# Wait for emulators to initialize
log_info "Waiting for emulators to start (10 seconds)..."
sleep 10

# Check if emulators are running
if ! ps -p $EMULATOR_PID > /dev/null; then
  log_error "Emulators failed to start. Check for port conflicts."
  exit 1
fi

# Step 4: Seed test data
log_info "Seeding test data..."
node scripts/seed-emulator.js
if [ $? -ne 0 ]; then
  log_error "Failed to seed test data."
  kill $EMULATOR_PID
  exit 1
fi
log_success "Test data seeded successfully."

# Done!
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Firebase Emulators Ready!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BLUE}Emulator UI:${NC}      http://localhost:4000"
echo -e "  ${BLUE}Firestore:${NC}        http://localhost:8080"
echo -e "  ${BLUE}Auth:${NC}             http://localhost:9099"
echo -e "  ${BLUE}Functions:${NC}        http://localhost:5001"
echo ""
echo -e "  ${YELLOW}To start the frontend:${NC} npm run dev"
echo ""
echo -e "  Press ${RED}Ctrl+C${NC} to stop the emulators."
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo ""

# Keep script running
wait $EMULATOR_PID
