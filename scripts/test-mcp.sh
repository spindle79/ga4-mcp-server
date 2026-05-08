#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BLUE='\033[0;34m'

# Get the full paths
INSPECTOR_PATH=$(pwd)/node_modules/.bin/mcp-inspector
SERVER_PATH="$(pwd)/src/server.ts"

echo -e "${BLUE}Starting MCP automated tests...${NC}\n"

# Function to wait for server to be ready
wait_for_server() {
  echo "Waiting for server to be ready..."
  while ! curl -s "http://localhost:3001" > /dev/null; do
    sleep 1
  done
  echo "Server is ready!"
}

# Start the server in the background
echo -e "${BLUE}Starting server in development mode...${NC}"
pnpm run dev &
SERVER_PID=$!

# Wait for server to be ready
wait_for_server

# Function to run a test and check its output
run_test() {
    local test_name=$1
    local command=$2
    
    echo -e "\n${BLUE}Running test: ${test_name}${NC}"
    
    # Run the command and capture output
    output=$(eval "$command")
    
    # Check if the command succeeded
    if [ $? -eq 0 ] && echo "$output" | grep -q "error" -v; then
        echo -e "${GREEN}✓ Test passed: ${test_name}${NC}"
        return 0
    else
        echo -e "${RED}✗ Test failed: ${test_name}${NC}"
        echo -e "${RED}Output: ${output}${NC}"
        return 1
    fi
}

# Initialize test results
TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: List available tools
echo -e "\n${BLUE}Testing tool listing...${NC}"
run_test "List Tools" "$INSPECTOR_PATH --cli $SERVER_PATH --method tools/list"
[ $? -eq 0 ] && ((TESTS_PASSED++)) || ((TESTS_FAILED++))

# Test 2: Get URL engagement for /test-page
echo -e "\n${BLUE}Testing getUrlEngagement...${NC}"
run_test "Get URL Engagement" "$INSPECTOR_PATH --cli $SERVER_PATH --method tools/call --tool-name getUrlEngagement --tool-arg url=/test"
[ $? -eq 0 ] && ((TESTS_PASSED++)) || ((TESTS_FAILED++))

# Test 3: Get URL traffic sources for /test-page
echo -e "\n${BLUE}Testing getUrlSourceTraffic...${NC}"
run_test "Get URL Traffic Sources" "$INSPECTOR_PATH --cli $SERVER_PATH --method tools/call --tool-name getUrlSourceTraffic --tool-arg url=/test"
[ $? -eq 0 ] && ((TESTS_PASSED++)) || ((TESTS_FAILED++))

# Test 4: Get URL conversions for /test-page
echo -e "\n${BLUE}Testing getUrlConversions...${NC}"
run_test "Get URL Conversions" "$INSPECTOR_PATH --cli $SERVER_PATH --method tools/call --tool-name getUrlConversions --tool-arg url=/test"
[ $? -eq 0 ] && ((TESTS_PASSED++)) || ((TESTS_FAILED++))

# Test 5: Get all URL analytics for /test-page
echo -e "\n${BLUE}Testing getUrlAnalytics...${NC}"
run_test "Get URL Analytics" "$INSPECTOR_PATH --cli $SERVER_PATH --method tools/call --tool-name getUrlAnalytics --tool-arg url=/test"
[ $? -eq 0 ] && ((TESTS_PASSED++)) || ((TESTS_FAILED++))

# Test 6: Test date range parameters
echo -e "\n${BLUE}Testing date range parameters...${NC}"
run_test "Date Range Parameters" "$INSPECTOR_PATH --cli $SERVER_PATH --method tools/call --tool-name getUrlAnalytics --tool-arg url=/test --tool-arg startDate=2024-01-01 --tool-arg endDate=2024-01-31"
[ $? -eq 0 ] && ((TESTS_PASSED++)) || ((TESTS_FAILED++))

# Test 7: Test timeframe parameter
echo -e "\n${BLUE}Testing timeframe parameter...${NC}"
run_test "Timeframe Parameter" "$INSPECTOR_PATH --cli $SERVER_PATH --method tools/call --tool-name getUrlAnalytics --tool-arg url=/test --tool-arg timeframe='last month'"
[ $? -eq 0 ] && ((TESTS_PASSED++)) || ((TESTS_FAILED++))

# Kill the server process
kill $SERVER_PID

# Print test summary
echo -e "\n${BLUE}Test Summary:${NC}"
echo -e "${GREEN}Tests passed: ${TESTS_PASSED}${NC}"
echo -e "${RED}Tests failed: ${TESTS_FAILED}${NC}"

# Exit with failure if any tests failed
[ $TESTS_FAILED -eq 0 ] || exit 1 