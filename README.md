# AI Interview Coach

An automated, real-time platform designed to simulate technical and behavioral interviews using generative AI. Built on a modular backend configuration featuring WebSockets for persistent connectivity, Redis for active request caching, and MongoDB for structured session logging.

## Key Features

* **Real-time Engine:** Configured over standard WebSockets (`ws`) utilizing a custom Modular Real-Time Socket Router Gateway.
* **AI Evaluation Pipeline:** Powered by Google Gemini AI (`@google/genai`) to dynamically evaluate user performance and stream interactive chat loops.
* **Resume Upload Subsystem:** Handles direct client-side stream uploads to AWS S3 using highly secure, cryptographically pre-signed URLs.
* **Automated Scorecards:** Automatically calculates performance insights and displays breakdown structures upon session end.

---

## System Architecture & Stack

* **Runtime:** Node.js (v22 / Alpine Linux)
* **Framework:** Express.js (v5 ecosystem)
* **Database Layer:** MongoDB via Mongoose ODM
* **Caching Layer:** Redis Engine via `ioredis`
* **DevOps Containerization:** Docker & Managed Docker-Compose layers

---

## Local Setup & Execution Guide

You can launch this entire application locally using two different methods. **Method 1 (Docker) is highly recommended** as it spins up pre-configured databases and services automatically without requiring external software installations.

### Prerequisites

Before launching, make sure you have the following tools installed:

* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Required for Method 1)
* [Node.js v22+](https://nodejs.org/) & npm (Required for Method 2)

---

### Method 1: One-Command Spin-up (Recommended)

This approach completely containerizes the application layer alongside an isolated Redis engine cache. You do not need to install Redis or configure complex infrastructure on your laptop.

#### 1. Setup Local Environment File

Create a `.env` file in the root directory of the project and populate it with your active API keys:

```env
NODE_ENV=development
PORT=5000
BASE_URL=http://localhost:5000

# Core APIs (Replace with your actual keys)
GEMINI_API_KEY=your_google_gemini_api_key
JWT_SECRET=any_fallback_secret_string
REDIS_URL=redis://127.0.0.1:6379

# Optional Service Keys (Leave empty or map values if testing these systems)
MONGODB_URL=your_mongodb_atlas_dev_string
DB_PASSWORD=
CASHFREE_APP_ID=
CASHFREE_SECRET_KEY=
BREVO_API_KEY=
AWS_REGION=ap-south-1
BUCKET_NAME=resume247
IAM_USER_KEY=
IAM_USER_SECRET=

```

#### 2. Create the Local Override Layer

Create a file named `docker-compose.override.yml` in the root folder. This injects a localized runtime Redis architecture and maps ports dynamically:

```yaml
version: '3.8'

services:
  # Service 1: Node.js App
  interview-app:
    ports:
      - "5000:5000"
    volumes:
      - .:/usr/src/app
      - /usr/src/app/node_modules
    command: npm start
    environment:
      - NODE_ENV=development
      - PORT=5000
      - BASE_URL=http://localhost:5000
      - REDIS_URL=redis://redis-cache:6379
    depends_on:
      - redis-cache

  # Service 2: Redis Database Engine
  redis-cache:
    image: redis:alpine
    ports:
      - "6379:6379"

```

#### 3. Execute Compose

Run the following build command inside your terminal:

```bash
docker compose up --build

```

Once compilation resolves, access the platform interface cleanly inside your web browser at **`http://localhost:5000`**.

---

### Method 2: Standard Node Run (Without Docker)

If you prefer running the application native to your machine runtime:

1. **Install Local Dependencies:**
```bash
npm install

```


2. **Configure Environment Paths:**
Ensure your `.env` contains your targeted cloud database endpoints:
```env
NODE_ENV=development
PORT=5000
BASE_URL=http://localhost:5000

# Core APIs (Replace with your actual keys)
GEMINI_API_KEY=your_google_gemini_api_key
JWT_SECRET=any_fallback_secret_string
REDIS_URL=redis://127.0.0.1:6379

# Optional Service Keys (Leave empty or map values if testing these systems)
MONGODB_URL=your_mongodb_atlas_dev_string
DB_PASSWORD=
CASHFREE_APP_ID=
CASHFREE_SECRET_KEY=
BREVO_API_KEY=
AWS_REGION=ap-south-1
BUCKET_NAME=resume247
IAM_USER_KEY=
IAM_USER_SECRET=

```
*(Note: Ensure you have a local Redis instance running on port 6379 for this method).*

3. **Boot the App Server:**
```bash
npm start

```


Open your browser and navigate directly to **`http://localhost:5000`**.

---

## Security Configuration Note

For full resume pipeline validation testing, adjust your destination AWS S3 storage permissions boundary configuration block to explicitly process localhost requests:

```json
[
    {
        "AllowedOrigins": ["http://localhost:5000"],
        "AllowedMethods": ["PUT", "POST", "GET"],
        "AllowedHeaders": ["*"]
    }
]

```

---
