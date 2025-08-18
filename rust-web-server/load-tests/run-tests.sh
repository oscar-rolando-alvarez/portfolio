#!/bin/bash

# Load testing script for Rust Web Server

set -e

BASE_URL="http://localhost:8080"
RESULTS_DIR="./results"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Load Tests for Rust Web Server${NC}"

# Create results directory
mkdir -p $RESULTS_DIR

# Check if server is running
echo -e "${YELLOW}Checking if server is running...${NC}"
if ! curl -f -s $BASE_URL/api/health > /dev/null; then
    echo -e "${RED}❌ Server is not running at $BASE_URL${NC}"
    echo "Please start the server first: cargo run"
    exit 1
fi
echo -e "${GREEN}✅ Server is running${NC}"

# Function to run wrk test
run_wrk_test() {
    local test_name=$1
    local threads=$2
    local connections=$3
    local duration=$4
    local script=${5:-""}
    
    echo -e "${YELLOW}Running $test_name...${NC}"
    
    if [ -n "$script" ]; then
        wrk -t$threads -c$connections -d$duration -s $script $BASE_URL \
            > $RESULTS_DIR/wrk_${test_name}_$(date +%Y%m%d_%H%M%S).txt
    else
        wrk -t$threads -c$connections -d$duration $BASE_URL/api/health \
            > $RESULTS_DIR/wrk_${test_name}_$(date +%Y%m%d_%H%M%S).txt
    fi
    
    echo -e "${GREEN}✅ $test_name completed${NC}"
}

# Function to run k6 test
run_k6_test() {
    if command -v k6 &> /dev/null; then
        echo -e "${YELLOW}Running K6 load test...${NC}"
        k6 run k6-load-test.js > $RESULTS_DIR/k6_results_$(date +%Y%m%d_%H%M%S).txt
        echo -e "${GREEN}✅ K6 test completed${NC}"
    else
        echo -e "${YELLOW}⚠️ K6 not found, skipping K6 tests${NC}"
    fi
}

# Test 1: Basic load test
run_wrk_test "basic_load" 4 100 30s

# Test 2: High concurrency test
run_wrk_test "high_concurrency" 8 400 30s

# Test 3: Extended duration test
run_wrk_test "extended_duration" 4 200 2m

# Test 4: Mixed endpoints test
if [ -f "wrk-script.lua" ]; then
    run_wrk_test "mixed_endpoints" 6 300 60s "wrk-script.lua"
fi

# Test 5: K6 comprehensive test
run_k6_test

# Function to run Apache Bench test
run_ab_test() {
    if command -v ab &> /dev/null; then
        echo -e "${YELLOW}Running Apache Bench test...${NC}"
        ab -n 10000 -c 100 -g $RESULTS_DIR/ab_results.tsv $BASE_URL/api/health \
            > $RESULTS_DIR/ab_results_$(date +%Y%m%d_%H%M%S).txt 2>&1
        echo -e "${GREEN}✅ Apache Bench test completed${NC}"
    else
        echo -e "${YELLOW}⚠️ Apache Bench not found, skipping AB tests${NC}"
    fi
}

# Test 6: Apache Bench test
run_ab_test

echo -e "${GREEN}🎉 All load tests completed!${NC}"
echo -e "${YELLOW}Results saved to: $RESULTS_DIR${NC}"

# Display summary
echo -e "\n${GREEN}📊 Test Summary:${NC}"
echo "=================="
ls -la $RESULTS_DIR/

# If gnuplot is available, generate graphs
if command -v gnuplot &> /dev/null && [ -f "$RESULTS_DIR/ab_results.tsv" ]; then
    echo -e "${YELLOW}Generating performance graphs...${NC}"
    gnuplot << EOF
set terminal png
set output '$RESULTS_DIR/response_time_graph.png'
set title "Response Time Distribution"
set xlabel "Request"
set ylabel "Response Time (ms)"
plot '$RESULTS_DIR/ab_results.tsv' using 9 with lines title "Response Time"
EOF
    echo -e "${GREEN}✅ Performance graph generated: $RESULTS_DIR/response_time_graph.png${NC}"
fi

echo -e "\n${GREEN}🔍 To analyze results:${NC}"
echo "1. Check individual result files in $RESULTS_DIR"
echo "2. Look for error rates and response times"
echo "3. Monitor server metrics during tests"
echo "4. Compare results across different test runs"

echo -e "\n${YELLOW}💡 Tips for better performance:${NC}"
echo "- Increase worker threads: APP_WORKERS=8"
echo "- Tune database connection pool"
echo "- Enable connection keep-alive"
echo "- Use production build: cargo build --release"