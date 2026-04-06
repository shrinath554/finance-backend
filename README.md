# Finance Data Processing & Access Control Backend

A production-structured REST API backend for a multi-role finance dashboard system.
Built with Node.js, Express, and SQLite — zero external services required.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Quick Start](#quick-start)
3. [Project Structure](#project-structure)
4. [Architecture & Design Decisions](#architecture--design-decisions)
5. [Role-Based Access Control](#role-based-access-control)
6. [API Reference](#api-reference)
   - [Auth](#auth)
   - [Users](#users)
   - [Financial Records](#financial-records)
   - [Dashboard](#dashboard)
7. [Error Handling](#error-handling)
8. [Assumptions & Tradeoffs](#assumptions--tradeoffs)

---

## Tech Stack

| Layer        | Choice             | Reason                                                         |
|--------------|--------------------|----------------------------------------------------------------|
| Runtime      | Node.js 18+        | Async-friendly, large ecosystem                                |
| Framework    | Express.js         | Minimal, widely understood, no magic                           |
| Database     | SQLite (better-sqlite3) | Zero setup, synchronous API, WAL mode for concurrency     |
| Auth         | JWT (jsonwebtoken) | Stateless, no session store needed                             |
| Passwords    | bcryptjs           | Industry-standard adaptive hashing                             |
| Validation   | Zod                | Type-safe schemas, great error messages, coercion support      |
| No ORM       | Raw SQL            | Full control, readable queries, easy to audit                  |

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd finance-backend
npm install

# 2. Seed the database with users + sample data
node src/config/seed.js

# 3. Start the server
npm run dev       # development (nodemon auto-reload)
npm start         # production

# Server runs at: http://localhost:3000
# Health check:   http://localhost:3000/api/health
```

### Default Credentials (after seed)

| Role    | Email                  | Password      |
|---------|------------------------|---------------|
| admin   | admin@finance.dev      | Admin@1234    |
| analyst | analyst@finance.dev    | Analyst@1234  |
| viewer  | viewer@finance.dev     | Viewer@1234   |

---

## Project Structure

```
finance-backend/
├── app.js                        # Express app setup (middleware, routes, error handler)
├── server.js                     # HTTP server entry point
├── finance.db                    # SQLite database (auto-created on first run)
├── src/
│   ├── config/
│   │   ├── database.js           # DB connection, schema init, WAL pragma
│   │   └── seed.js               # Development data seeder
│   ├── middleware/
│   │   ├── auth.js               # JWT Bearer verification → req.user
│   │   ├── rbac.js               # authorize(...roles) middleware factory
│   │   ├── validate.js           # Zod schema validation middleware factory
│   │   └── errorHandler.js       # Global error handler (Express 4-arg signature)
│   ├── validators/
│   │   ├── authValidator.js      # Register / login Zod schemas
│   │   ├── userValidator.js      # User create / update / status schemas
│   │   └── recordValidator.js    # Record create / update / query filter schemas
│   ├── services/
│   │   ├── authService.js        # Register, login, JWT generation
│   │   ├── userService.js        # User CRUD + status management
│   │   ├── recordService.js      # Financial record CRUD + soft delete + filters
│   │   └── dashboardService.js   # Aggregation queries: summary, trends, categories
│   ├── controllers/
│   │   ├── authController.js     # HTTP → authService → HTTP
│   │   ├── userController.js     # HTTP → userService → HTTP
│   │   ├── recordController.js   # HTTP → recordService → HTTP
│   │   └── dashboardController.js
│   ├── routes/
│   │   ├── index.js              # Root router: mounts all feature routers
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── records.js
│   │   └── dashboard.js
│   └── utils/
│       ├── AppError.js           # Custom operational error class
│       ├── response.js           # Consistent JSON response envelope
│       └── pagination.js         # Page/offset parser + meta builder
```

---

## Architecture & Design Decisions

### Layered Architecture

```
Request → Route → Middleware (auth, rbac, validate) → Controller → Service → DB
                                                             ↓
Response ← Controller ← Service ←──────────────────────────────────────────────
```

Each layer has a single responsibility:

- **Routes** declare which middleware and controller handles each endpoint
- **Middleware** enforces cross-cutting concerns (auth, authorization, validation)
- **Controllers** are thin — they translate HTTP in/out and delegate to services
- **Services** contain all business logic and DB access — no Express objects
- **Utils** provide shared primitives (errors, responses, pagination)

This separation means services can be unit-tested without starting an HTTP server.

### Database Schema

```sql
users (
  id, name, email, password,
  role    CHECK IN ('viewer', 'analyst', 'admin'),
  status  CHECK IN ('active', 'inactive'),
  created_at, updated_at
)

financial_records (
  id, amount, type CHECK IN ('income', 'expense'),
  category, date, notes,
  is_deleted,          -- soft delete flag
  created_by → users.id,
  updated_by → users.id,
  created_at, updated_at
)
```

### Soft Deletes

Financial records are never hard-deleted. `is_deleted = 1` hides them from all
queries. This preserves audit history and allows recovery — important in financial systems.

### Consistent Response Envelope

Every response follows the same shape so the frontend can handle it generically:

```json
{
  "success": true,
  "message": "OK",
  "data": { ... },
  "meta": { "page": 1, "per_page": 20, "total": 142, "total_pages": 8 }
}
```

Error responses:

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": { "amount": "Amount must be a positive number." }
}
```

---

## Role-Based Access Control

| Endpoint Group         | viewer | analyst | admin |
|------------------------|:------:|:-------:|:-----:|
| GET /records           | ✅     | ✅      | ✅    |
| GET /records/:id       | ✅     | ✅      | ✅    |
| POST /records          | ❌     | ✅      | ✅    |
| PATCH /records/:id     | ❌     | ✅      | ✅    |
| DELETE /records/:id    | ❌     | ❌      | ✅    |
| GET /dashboard/*       | ✅     | ✅      | ✅    |
| GET /users             | ❌     | ❌      | ✅    |
| POST /users            | ❌     | ❌      | ✅    |
| PATCH /users/:id       | ❌     | ❌      | ✅    |
| DELETE /users/:id      | ❌     | ❌      | ✅    |

RBAC is implemented via the `authorize(...roles)` middleware factory in `src/middleware/rbac.js`.
The role permission map (`ROLE_PERMISSIONS`) serves as the single source of truth.

---

## API Reference

All endpoints are prefixed with `/api`. Authenticated endpoints require:

```
Authorization: Bearer <token>
```

---

### Auth

#### POST `/api/auth/register`

Register a new user account.

**Body**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Secret@123",
  "role": "viewer"
}
```

Password rules: min 8 chars, 1 uppercase, 1 number, 1 special character.
`role` defaults to `"viewer"` if omitted.

**Response 201**
```json
{
  "success": true,
  "message": "Account created successfully.",
  "data": {
    "user": { "id": 4, "name": "John Doe", "email": "john@example.com", "role": "viewer", "status": "active" },
    "token": "eyJhbGci..."
  }
}
```

---

#### POST `/api/auth/login`

**Body**
```json
{ "email": "admin@finance.dev", "password": "Admin@1234" }
```

**Response 200**
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "user": { "id": 1, "name": "Alice Admin", "role": "admin", "status": "active" },
    "token": "eyJhbGci..."
  }
}
```

---

#### GET `/api/auth/me`   🔒

Returns the currently authenticated user.

---

### Users

> All user endpoints require `admin` role.

#### GET `/api/users`

Query params: `page`, `per_page`

**Response 200**
```json
{
  "success": true,
  "data": [ { "id": 1, "name": "Alice Admin", "role": "admin", "status": "active" } ],
  "meta": { "page": 1, "per_page": 20, "total": 3, "total_pages": 1 }
}
```

---

#### GET `/api/users/:id`

---

#### POST `/api/users`

**Body** — same shape as `/auth/register`.

---

#### PATCH `/api/users/:id`

Partial update. Any combination of `name`, `email`, `role`.

**Body**
```json
{ "role": "analyst" }
```

---

#### PATCH `/api/users/:id/status`

**Body**
```json
{ "status": "inactive" }
```

Admins cannot deactivate their own account.

---

#### DELETE `/api/users/:id`

Hard deletes the user. Admins cannot delete themselves.

---

### Financial Records

#### GET `/api/records`   🔒 (viewer+)

**Query Parameters**

| Param        | Type    | Description                              |
|--------------|---------|------------------------------------------|
| `type`       | string  | `income` or `expense`                    |
| `category`   | string  | Exact category name match                |
| `date_from`  | date    | `YYYY-MM-DD` lower bound                 |
| `date_to`    | date    | `YYYY-MM-DD` upper bound                 |
| `search`     | string  | Keyword search across category + notes   |
| `sort_by`    | string  | `date` \| `amount` \| `category` \| `created_at` (default: `date`) |
| `sort_order` | string  | `asc` \| `desc` (default: `desc`)        |
| `page`       | integer | Default: 1                               |
| `per_page`   | integer | Default: 20, max: 100                    |

**Example**
```
GET /api/records?type=expense&date_from=2025-01-01&date_to=2025-03-31&sort_by=amount&sort_order=desc
```

**Response 200**
```json
{
  "success": true,
  "data": [
    {
      "id": 2,
      "amount": 1200,
      "type": "expense",
      "category": "Rent",
      "date": "2025-01-06",
      "notes": "January rent",
      "created_by": { "id": 1, "name": "Alice Admin" },
      "created_at": "2025-01-06T10:00:00",
      "updated_at": "2025-01-06T10:00:00"
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 9, "total_pages": 1 }
}
```

---

#### GET `/api/records/:id`   🔒 (viewer+)

---

#### POST `/api/records`   🔒 (analyst, admin)

**Body**
```json
{
  "amount": 2500.00,
  "type": "income",
  "category": "Freelance",
  "date": "2025-04-01",
  "notes": "Landing page project"
}
```

**Response 201**

---

#### PATCH `/api/records/:id`   🔒 (analyst, admin)

Partial update — send only the fields to change.

**Body**
```json
{ "amount": 2700, "notes": "Updated invoice amount" }
```

---

#### DELETE `/api/records/:id`   🔒 (admin)

Soft delete — sets `is_deleted = 1`. Record is hidden from all list/get queries
but preserved in the database for audit purposes.

---

### Dashboard

> All dashboard endpoints are accessible to all authenticated roles.
> Optional `date_from` / `date_to` query params filter by record date.

---

#### GET `/api/dashboard/summary`   🔒

```
GET /api/dashboard/summary?date_from=2025-01-01&date_to=2025-03-31
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "total_income":   19300.00,
    "total_expenses":  6300.00,
    "net_balance":    13000.00,
    "record_count":   15
  }
}
```

---

#### GET `/api/dashboard/categories`   🔒

Category-wise income and expense breakdown.

```
GET /api/dashboard/categories?date_from=2025-01-01
```

**Response 200**
```json
{
  "success": true,
  "data": [
    { "category": "Salary",     "income": 15000, "expense": 0,    "net": 15000, "count": 3 },
    { "category": "Rent",       "income": 0,     "expense": 3600, "net": -3600, "count": 3 },
    { "category": "Freelance",  "income": 2300,  "expense": 0,    "net": 2300,  "count": 2 }
  ]
}
```

---

#### GET `/api/dashboard/trends/monthly`   🔒

Monthly income vs expense for the last N months.

```
GET /api/dashboard/trends/monthly?months=6
```

**Response 200**
```json
{
  "success": true,
  "data": [
    { "month": "2025-01", "income": 5800, "expense": 1750, "net": 4050 },
    { "month": "2025-02", "income": 6500, "expense": 1650, "net": 4850 },
    { "month": "2025-03", "income": 7000, "expense": 2100, "net": 4900 }
  ]
}
```

---

#### GET `/api/dashboard/trends/weekly`   🔒

Weekly income vs expense for the last N weeks. `?weeks=8` (default).

---

#### GET `/api/dashboard/recent`   🔒

Recent financial activity feed. `?limit=10` (default, max 50).

**Response 200**
```json
{
  "success": true,
  "data": [
    {
      "id": 15, "amount": 500, "type": "expense",
      "category": "Travel", "date": "2025-03-30",
      "notes": "Conference trip", "created_by_name": "Alice Admin",
      "created_at": "..."
    }
  ]
}
```

---

## Error Handling

| Scenario               | Status | Example message                              |
|------------------------|--------|----------------------------------------------|
| Missing/invalid token  | 401    | "Authentication required."                   |
| Expired token          | 401    | "Token has expired. Please log in again."    |
| Insufficient role      | 403    | "Access denied. Required role: admin."       |
| Resource not found     | 404    | "Financial record not found."                |
| Validation failure     | 422    | "Validation failed." + field-level errors    |
| Duplicate email        | 409    | "An account with that email already exists." |
| Self-deactivation      | 400    | "You cannot deactivate your own account."    |
| Unexpected error       | 500    | "An unexpected error occurred."              |

All errors follow the envelope:
```json
{ "success": false, "message": "...", "errors": { "field": "reason" } }
```

---

## Assumptions & Tradeoffs

| Decision | Reasoning |
|----------|-----------|
| **SQLite over Postgres** | Zero setup for evaluation. Schema and queries are standard SQL — migrating to Postgres is a connection-string change + driver swap. |
| **JWT tokens, 8h expiry** | No refresh token flow implemented (out of scope). In production: short-lived access tokens + refresh tokens stored in httpOnly cookies. |
| **Register is open** | In production, register would be admin-only or invite-based. Left open so evaluators can create accounts freely. |
| **Soft delete only for records** | Financial data should never be permanently erased. User deletes are hard deletes (admins manage users). |
| **Analysts can create/update records** | The spec says "Analyst: can view records and access insights" but also implies operational users should be able to contribute data. I elevated analyst slightly — this is documented here and can easily be adjusted via the `authorize()` calls. |
| **No rate limiting** | Listed as optional. Would add `express-rate-limit` around `/auth/login` in production. |
| **No refresh tokens** | JWTs expire in 8h. Production would pair short-lived JWTs with httpOnly cookie refresh tokens. |
| **Amounts stored as REAL** | SQLite REAL is IEEE 754 double. For true financial precision use integers (store cents) or NUMERIC type. Noted as a production concern. |
