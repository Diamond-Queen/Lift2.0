# API Documentation

## Overview
Lift 2.0 REST API provides endpoints for managing notes, resumes, cover letters, and user subscriptions.

## Authentication
All protected endpoints require a valid NextAuth session. Include the session cookie in requests.

```bash
# Login and get session
curl -X POST http://localhost:3000/api/auth/callback/credentials \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

## Endpoints

### Career API

#### POST /api/career
Generate resume or cover letter

**Request:**
```json
{
  "type": "resume",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "555-1234",
  "address": "123 Main St, City, ST 12345",
  "objective": "Seeking software engineering role",
  "skills": "Python, JavaScript, React",
  "experience": ["Software Engineer | Tech Corp | 2020-2023 | Led team of 5"],
  "education": ["BS Computer Science | State University | 2020"],
  "certifications": ["AWS Solutions Architect"]
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "result": {
      "name": "John Doe",
      "email": "john@example.com",
      "objective": "Results-driven software engineer...",
      "skills": ["Python", "Data Analysis", "Machine Learning", ...],
      "experience": [...],
      "education": [...]
    }
  }
}
```

**Status Codes:**
- `200`: Success
- `400`: Bad Request (missing required fields)
- `403`: Forbidden (insufficient subscription)
- `429`: Too Many Requests (rate limited)
- `500`: Server Error

### Notes API

#### POST /api/content/items
Create note, flashcard, or quiz

**Request:**
```json
{
  "type": "note",
  "title": "Biology Chapter 5",
  "originalInput": "Photosynthesis is the process...",
  "classId": "class-123"
}
```

#### GET /api/content/items
Fetch saved items for a class

**Query Parameters:**
- `classId`: Class ID filter
- `type`: Filter by type (note, resume, cover_letter)

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "item-123",
      "type": "note",
      "title": "Biology Chapter 5",
      "createdAt": "2024-02-03T10:00:00Z"
    }
  ]
}
```

### Classes API

#### POST /api/content/classes
Create a new class

**Request:**
```json
{
  "name": "Biology 101",
  "color": "#8b7500"
}
```

#### GET /api/content/classes
List all classes for user

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "class-123",
      "name": "Biology 101",
      "color": "#8b7500",
      "createdAt": "2024-02-03T10:00:00Z"
    }
  ]
}
```

### User API

#### GET /api/user
Get current user profile

**Response:**
```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "name": "John Doe",
      "schoolId": null,
      "onboarded": true,
      "subscriptions": [
        {
          "id": "sub-123",
          "plan": "full",
          "status": "active",
          "createdAt": "2024-01-01T00:00:00Z"
        }
      ]
    }
  }
}
```

#### GET /api/user/preferences
Get user preferences (theme, study mode, etc.)

#### PUT /api/user/preferences
Update user preferences

### Subscription API

#### GET /api/subscription
Get current subscription details

#### POST /api/subscription/create
Create new subscription (initiates Stripe checkout)

**Request:**
```json
{
  "plan": "full",
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "checkoutUrl": "https://checkout.stripe.com/..."
  }
}
```

#### POST /api/subscription/cancel
Cancel active subscription

## Error Handling

All errors follow this format:

```json
{
  "ok": false,
  "error": "Error message describing what went wrong"
}
```

**Common Error Codes:**
- `Unauthorized` (401): Missing or invalid session
- `Forbidden` (403): Insufficient permissions/subscription
- `Too Many Requests` (429): Rate limit exceeded
- `Server error` (500): Unexpected server error

## Rate Limiting

- IP-based: 30 requests/minute per endpoint
- User-based: 60 requests/minute per endpoint
- Authentication endpoints: 5 failed attempts = 15 minute lockout

**Rate Limit Headers:**
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 1704290400
```

## Pagination

List endpoints support pagination:

```
GET /api/content/items?page=1&limit=20
```

**Response:**
```json
{
  "ok": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

## Examples

### Create a Resume
```bash
curl -X POST http://localhost:3000/api/career \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "type": "resume",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "555-5678",
    "skills": "JavaScript, TypeScript, React",
    "objective": "Full-stack developer position"
  }'
```

### Create Study Notes
```bash
curl -X POST http://localhost:3000/api/content/items \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "type": "note",
    "title": "World History - Chapter 3",
    "originalInput": "The French Revolution was a period of social upheaval...",
    "classId": "class-123"
  }'
```

## Webhooks

### Subscription Events
Stripe webhooks for subscription updates are handled at `/api/subscription/webhook`

Events:
- `payment_intent.succeeded`: Payment processed
- `customer.subscription.updated`: Subscription modified
- `customer.subscription.deleted`: Subscription canceled
- `invoice.payment_succeeded`: Invoice paid

## Versioning

Current API version: v1 (no prefix required)

Future versions will use `/api/v2/` prefix.

## Support

For API issues:
- Check server logs: `logs/lift.log`
- Review Sentry dashboard for errors
- Contact: williams.lift101@gmail.com
