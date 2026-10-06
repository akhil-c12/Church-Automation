# Church Automation — Setup & Usage Guide

Complete instructions on how to install, configure, connect, and run the **Church Automation (Birthday Desk)** project from this repository.

---

## 1. Architecture Overview

This repository is split into two cleanly separated tiers:

```
┌─────────────────────────────────┐                 ┌─────────────────────────────────┐
│        frontend/ (Next.js)      │   /api/* proxy  │        backend/ (Express)       │
│      http://localhost:3000      ├────────────────►│      http://localhost:4000      │
│  - React 19 UI                  │  (Same-Origin)  │  - Single-admin auth (JWT)      │
│  - TanStack Query cache         │                 │  - Origin & CSRF guard          │
│  - Live SSE listeners           │◄────────────────┤  - Real-time SSE broker (/events│
└─────────────────────────────────┘   Server-Sent   │  - Resilient n8n webhook client │
                                        Events      └────────────────┬────────────────┘
                                                                     │ X-API-Key
                                                                     ▼
                                                    ┌─────────────────────────────────┐
                                                    │       n8n Workflow Engine       │
                                                    │   - Google Sheets (Database)    │
                                                    │   - WhatsApp Cloud API          │
                                                    └─────────────────────────────────┘
```

- **`frontend/`**: Next.js 16 App Router interface. All API calls target same-origin `/api/*` and are proxied to the backend. No secrets or external addresses reach client-side bundles.
- **`backend/`**: Express 5 TypeScript API gateway. Handles admin authentication, rate limiting, input validation (Zod), SSE event broadcasting, and communicates with n8n.

---

## 2. Prerequisites

- **Node.js**: `v20.x` or `v22.x+`
- **npm**: `v10.x+`
- **Git**

---

## 3. Installation

Clone the repository and install dependencies in both folders:

```bash
# Clone the repository
git clone https://github.com/akhil-c12/Church-Automation.git
cd Church-Automation

# 1. Install Backend Dependencies
cd backend
npm install

# 2. Install Frontend Dependencies
cd ../frontend
npm install
```

---

## 4. Environment Configuration

### Step A: Configure Backend (`backend/.env`)

In `backend/`, copy the example file:
```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and review the configuration:

```ini
PORT=4000
NODE_ENV=development
LOG_LEVEL=info
FRONTEND_ORIGIN=http://localhost:3000
TRUST_PROXY=1

# Admin credentials
ADMIN_USERNAME=admin
# Generate a secure password hash using: npm run hash-password
# Default local dev password: '$2b$12$e0X7X8a0YqW5aM9m8i4OLe9bYf7Q1Z5W6V4U3T2S1R0Q9P8O7N6M5'
ADMIN_PASSWORD_HASH='$2b$12$...'

# JWT signing secret (min 32 chars)
JWT_SECRET=super-secret-jwt-key-min-32-chars-long
JWT_TTL_HOURS=12

# n8n Automation connection
# Use your production/test webhook base URL
N8N_WEBHOOK_BASE=https://your-n8n-instance.app/webhook
N8N_API_KEY=your-n8n-api-key-min-16-chars
N8N_TIMEOUT_MS=30000
N8N_CALLBACK_KEY=your-n8n-callback-key-min-32-chars
```

> **Testing without a live n8n instance?**  
> The backend includes an in-memory mock n8n server. You can run `npm run mock:n8n` in `backend/` and point `N8N_WEBHOOK_BASE=http://127.0.0.1:5679/webhook`.

### Step B: Configure Frontend (`frontend/.env.local`)

In `frontend/`, create `.env.local` to tell Next.js where the backend is running:

```bash
cd frontend
cp .env.example .env.local
```

Inside `frontend/.env.local`:
```ini
BACKEND_URL=http://127.0.0.1:4000
```

---

## 5. How to Connect Frontend & Backend

The connection between the frontend and backend is managed cleanly via **Next.js internal rewrites** defined in `frontend/next.config.ts`:

```typescript
async rewrites() {
  return [{ source: "/api/:path*", destination: `${BACKEND_URL}/:path*` }];
}
```

1. **Browser requests `/api/members`**: The browser always talks to port `3000`.
2. **Next.js proxying**: The Next.js server proxies the request to `http://127.0.0.1:4000/members`.
3. **Session handling**: The HTTP-only `cbd_session` cookie is sent seamlessly on the same origin without CORS or cookie-dropping issues.
4. **CORS / Origin check**: The backend checks that requests originate from `FRONTEND_ORIGIN` (`http://localhost:3000`).

---

## 6. Running the Project

### Running in Development

Open two terminal windows:

#### Terminal 1 — Start Backend
```bash
cd backend
npm run dev
```
*Backend runs on `http://localhost:4000` (Healthcheck: `http://localhost:4000/health/live`).*

#### Terminal 2 — Start Frontend
```bash
cd frontend
npm run dev
```
*Frontend runs on `http://localhost:3000`.*

---

## 7. Using the Application

1. **Login**:
   - Open your browser to `http://localhost:3000`.
   - Sign in using the credentials defined in `backend/.env`.
2. **Today's Birthdays (`/today`)**:
   - View birthdays scheduled for today, greeting delivery statistics, and coming birthdays in the next 14 days.
   - Click **"Send wishes"** to trigger greeting delivery.
3. **Members Register (`/members`)**:
   - Search, filter by active/inactive status, WhatsApp opt-in, or birthday month.
   - Spot records with missing birth dates or invalid numbers highlighted with data issue badges.
4. **Add / Edit Member (`/members/new` & `/members/:id`)**:
   - Add new members with real-time preview and phone number formatting.
   - Safe deactivation toggle (no accidental hard deletes).
5. **Batch CSV Import (`/import`)**:
   - Upload member spreadsheets.
   - Runs a dry-run check first (`/members/verify`) to detect errors before committing changes to Google Sheets.
6. **Live Execution & Logs (`/runs` & `/messages`)**:
   - Live SSE updates notify the dashboard when runs complete.
   - Full audit log of WhatsApp message statuses and delivery timestamps.

---

## 8. Production Deployment

### Building Frontend
```bash
cd frontend
npm run build
npm start
```

### Building Backend
```bash
cd backend
npm run build
npm start
```
*(Or run with Docker: `cd backend && docker compose up -d --build`)*
