#!/bin/bash

echo "=========================================="
echo "   RUNNING MEDIQUERY AI - E2E SUITE"
echo "   (Full Stack Integration Tests)"
echo "=========================================="
echo ""

echo -e "\033[36m[E2E] Starting Full Stack Environment...\033[0m"
# Clean up previous runs
docker compose -f docker-compose.test.yml --profile e2e down -v --remove-orphans
sleep 2

echo -e "\033[36m[E2E] Building and Running Tests...\033[0m"
# Abort entire stack if the runner fails
# We include docker-compose.yml to inherit services (db, postgres) and environment variables
docker compose -f docker-compose.test.yml --profile e2e up --build --abort-on-container-exit --exit-code-from e2e-runner \
  e2e-runner frontend backend test-db test-postgres
EXIT_CODE_PLAYWRIGHT=$?



    EXIT_CODE=$EXIT_CODE_PLAYWRIGHT

echo -e "\033[36m[E2E] Tearing down...\033[0m"
docker compose -f docker-compose.test.yml --profile e2e down -v --remove-orphans

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "\033[32m✅ E2E Tests Passed!\033[0m"
    exit 0
else
    echo -e "\033[31m❌ E2E Tests Failed!\033[0m"
    exit $EXIT_CODE
fi
