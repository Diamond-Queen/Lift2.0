#!/bin/bash

# Test runner script with multiple modes
# Usage: npm run test:full, npm run test:unit, npm run test:integration, etc.

set -e

echo "🧪 Test Runner Script"
echo "===================="

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the test mode (default to all)
TEST_MODE=${1:-all}

case $TEST_MODE in
  all)
    echo -e "${BLUE}Running all tests...${NC}"
    npm test -- --coverage
    ;;
  unit)
    echo -e "${BLUE}Running unit tests...${NC}"
    npm test -- tests/unit --coverage
    ;;
  integration)
    echo -e "${BLUE}Running integration tests...${NC}"
    npm test -- tests/integration
    ;;
  watch)
    echo -e "${BLUE}Running tests in watch mode...${NC}"
    npm test -- --watch
    ;;
  debug)
    echo -e "${BLUE}Running tests with debugging...${NC}"
    node --inspect-brk node_modules/.bin/jest --runInBand
    ;;
  coverage)
    echo -e "${BLUE}Generating coverage report...${NC}"
    npm test -- --coverage --collectCoverageFrom="lib/**/*.ts,lib/**/*.js"
    ;;
  *)
    echo -e "${RED}Unknown test mode: $TEST_MODE${NC}"
    echo "Available modes:"
    echo "  all         - Run all tests with coverage (default)"
    echo "  unit        - Run unit tests only"
    echo "  integration - Run integration tests only"
    echo "  watch       - Run tests in watch mode"
    echo "  debug       - Run tests with Node debugger"
    echo "  coverage    - Generate coverage report"
    exit 1
    ;;
esac

echo -e "${GREEN}✓ Tests completed successfully!${NC}"
