# PulseArena: Fullstack Fan Engagement Application

This repository contains the containerized fullstack application for PulseArena. It combines a Next.js App Router frontend with a custom Express + WebSocket server running in a unified runtime.

## Features Included
*   **Live Score & Telemetry Dashboard**: Feeds active match data and timelines over low-latency WebSockets.
*   **Play Predictions**: Active sub-rounds that let users bet points and settle outcomes dynamically.
*   **Alliance Chat**: Live room filters supporting general, Real Madrid, and Barcelona fan communities with moderation checks.
*   **Conversational AI**: Stat query processor using mock RAG database indexes.
*   **Gamification Systems**: Daily login streak tracking, XP milestones, and leveling badge unlocks.

---

## Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Launch Server
```bash
npm run dev
```
Open [http://localhost:8080](http://localhost:8080) in your web browser.

---

## Deploying to Google Cloud Platform (GCP)

Deploy the application directly to **Google Cloud Run** using Google Cloud Build and Artifact Registry.

### 1. Authenticate with Google Cloud
Ensure the Google Cloud SDK (`gcloud`) is installed, then authenticate your CLI:
```bash
gcloud auth login
gcloud auth configure-docker
```

### 2. Set Project Configuration
Set your active GCP project ID:
```bash
gcloud config set project YOUR_GCP_PROJECT_ID
```

### 3. Enable Required Google API Services
Enable the services required for builds, image registries, and serverless hosting:
```bash
gcloud services enable artifactregistry.googleapis.com run.googleapis.com cloudbuild.googleapis.com
```

### 4. Create Artifact Registry Repository
Create a Docker registry repository in your target region (e.g., `us-central1`):
```bash
gcloud artifacts repositories create pulsearena-repo --repository-format=docker --location=us-central1 --description="PulseArena Docker Registry"
```

### 5. Build and Submit Container Image via Cloud Build
Run the build command from the project root directory. This builds the Dockerfile on GCP and tags it in your Artifact Registry repository:
```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_GCP_PROJECT_ID/pulsearena-repo/pulsearena-app:latest .
```

### 6. Deploy Container to Google Cloud Run
Deploy the compiled container image. Cloud Run automatically exposes port `8080` (HTTP and WebSockets):
```bash
gcloud run deploy pulsearena-service --image us-central1-docker.pkg.dev/YOUR_GCP_PROJECT_ID/pulsearena-repo/pulsearena-app:latest --platform managed --region us-central1 --allow-unauthenticated
```

Once deployment completes, the CLI will output a live public URL (e.g., `https://pulsearena-service-xxxx-uc.a.run.app`). Open this URL in any mobile or desktop web browser to access the live dashboard.
