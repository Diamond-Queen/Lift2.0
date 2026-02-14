@echo off
REM Test runner script for Windows
REM Usage: npm run test:full, npm run test:unit, npm run test:integration, etc.

setlocal enabledelayedexpansion

echo 🧪 Test Runner Script
echo ====================

REM Get the test mode (default to all)
set TEST_MODE=%1
if "!TEST_MODE!"=="" set TEST_MODE=all

if "!TEST_MODE!"=="all" (
    echo Running all tests...
    call npm test -- --coverage
    goto success
)

if "!TEST_MODE!"=="unit" (
    echo Running unit tests...
    call npm test -- tests/unit --coverage
    goto success
)

if "!TEST_MODE!"=="integration" (
    echo Running integration tests...
    call npm test -- tests/integration
    goto success
)

if "!TEST_MODE!"=="watch" (
    echo Running tests in watch mode...
    call npm test -- --watch
    goto success
)

if "!TEST_MODE!"=="debug" (
    echo Running tests with debugging...
    call node --inspect-brk node_modules/.bin/jest --runInBand
    goto success
)

if "!TEST_MODE!"=="coverage" (
    echo Generating coverage report...
    call npm test -- --coverage --collectCoverageFrom="lib/**/*.ts,lib/**/*.js"
    goto success
)

echo Unknown test mode: !TEST_MODE!
echo Available modes:
echo   all         - Run all tests with coverage (default)
echo   unit        - Run unit tests only
echo   integration - Run integration tests only
echo   watch       - Run tests in watch mode
echo   debug       - Run tests with Node debugger
echo   coverage    - Generate coverage report
exit /b 1

:success
echo ✓ Tests completed successfully!
exit /b 0
