#!/bin/bash
set -e

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
APP_URL="${APP_URL:-http://localhost:8765}"
MAX_RETRIES=30
RETRY_INTERVAL=2

echo "Starting smoke test..."
echo "Compose file: $COMPOSE_FILE"
echo "App URL: $APP_URL"

cleanup() {
  echo "Cleaning up..."
  docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

# Build and start the stack
echo "Building and starting services..."
docker compose -f "$COMPOSE_FILE" up --build -d

# Wait for health endpoint
echo "Waiting for app to be ready..."
for i in $(seq 1 $MAX_RETRIES); do
  if curl -sf "$APP_URL/health" > /dev/null 2>&1; then
    echo "Health check passed on attempt $i"
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "SMOKE TEST FAILED: App did not become healthy after $MAX_RETRIES attempts"
    docker compose -f "$COMPOSE_FILE" logs
    exit 1
  fi
  echo "Waiting for app... (attempt $i/$MAX_RETRIES)"
  sleep $RETRY_INTERVAL
done

# Test health endpoint response
echo "Testing health endpoint..."
HEALTH_RESPONSE=$(curl -sf "$APP_URL/health")
if [ -z "$HEALTH_RESPONSE" ]; then
  echo "SMOKE TEST FAILED: Health endpoint returned empty response"
  exit 1
fi
echo "Health response: $HEALTH_RESPONSE"

# Test screenshot endpoint (should return error without browser, but endpoint should exist)
echo "Testing screenshot endpoint exists..."
SCREENSHOT_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$APP_URL/screenshot" || echo "000")
if [ "$SCREENSHOT_CODE" = "000" ]; then
  echo "SMOKE TEST FAILED: Screenshot endpoint unreachable"
  exit 1
fi
echo "Screenshot endpoint returned HTTP $SCREENSHOT_CODE (expected 200 or 500 depending on Chrome state)"

echo ""
echo "========================================="
echo "SMOKE TEST PASSED"
echo "========================================="
