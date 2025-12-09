#!/bin/bash
# Test authentication flow

BASE_URL="http://localhost:3000"
TEST_EMAIL="testuser$(date +%s)@example.com"
TEST_PASSWORD="TestPass123!"
TEST_NAME="Test User"

echo "=== Testing Auth Flow ==="
echo "Email: $TEST_EMAIL"
echo ""

# 1. Register
echo "1. Testing registration..."
REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$TEST_NAME\",\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

HTTP_CODE=$(echo "$REGISTER_RESPONSE" | tail -n1)
BODY=$(echo "$REGISTER_RESPONSE" | sed '$d')

echo "Status: $HTTP_CODE"
echo "Response: $BODY"
echo ""

if [ "$HTTP_CODE" != "201" ]; then
  echo "❌ Registration failed"
  exit 1
fi

echo "✓ Registration successful"
echo ""

# 2. Get CSRF token
echo "2. Getting CSRF token..."
CSRF_RESPONSE=$(curl -s -c /tmp/cookies.txt "$BASE_URL/api/auth/csrf")
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)
echo "CSRF Token: ${CSRF_TOKEN:0:20}..."
echo ""

# 3. Login
echo "3. Testing login..."
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/callback/credentials" \
  -b /tmp/cookies.txt -c /tmp/cookies.txt \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=$CSRF_TOKEN&email=$TEST_EMAIL&password=$TEST_PASSWORD&json=true")

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

echo "Status: $HTTP_CODE"
echo "Response: $BODY"
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Login failed"
  exit 1
fi

if echo "$BODY" | grep -q '"error"'; then
  echo "❌ Login returned error"
  exit 1
fi

echo "✓ Login successful"
echo ""

# 4. Get session
echo "4. Testing session..."
SESSION_RESPONSE=$(curl -s -b /tmp/cookies.txt "$BASE_URL/api/auth/session")
echo "Session: $SESSION_RESPONSE"
echo ""

if echo "$SESSION_RESPONSE" | grep -q "$TEST_EMAIL"; then
  echo "✓ Session valid"
else
  echo "❌ Session invalid"
  exit 1
fi

# 5. Get user
echo "5. Testing /api/user endpoint..."
USER_RESPONSE=$(curl -s -w "\n%{http_code}" -b /tmp/cookies.txt "$BASE_URL/api/user")

HTTP_CODE=$(echo "$USER_RESPONSE" | tail -n1)
BODY=$(echo "$USER_RESPONSE" | sed '$d')

echo "Status: $HTTP_CODE"
echo "Response: $BODY"
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ /api/user failed"
  exit 1
fi

if echo "$BODY" | grep -q "$TEST_EMAIL"; then
  echo "✓ User data retrieved successfully"
else
  echo "❌ User data incomplete"
  exit 1
fi

echo ""
echo "=== All tests passed! ==="
rm -f /tmp/cookies.txt
