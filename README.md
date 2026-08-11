# Helios Talent Intelligence — Prototype

Frontend-only HR transformation prototype for the Helios Financial Services case.

## What the prototype demonstrates

1. **Strategic Workforce Planning** — converts future business demand into MOVE / BUILD / BUY / BORROW recommendations.
2. **Internal Talent Marketplace** — matches employees to internal roles, projects, short-term gigs, mentors and learning using skills and aspirations rather than job title alone.
3. **AI Career Copilot** — explains skill gaps and creates an employee development pathway with learning, project experience, mentoring and internal mobility.
4. **Talent Intelligence** — searchable employee skills profiles and explainable readiness signals.

## Technology

- Plain HTML
- Plain CSS
- Vanilla JavaScript
- Synthetic prototype data only
- No backend / no API keys / no build tools

## Run locally

Open `index.html` directly, or serve the folder:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy on GitHub Pages

1. Create a GitHub repository.
2. Upload all files in this folder to the repository root.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select `main` and `/ (root)`.
6. Save. GitHub will publish the prototype as a static site.

## Prototype logic

The matching engine is deliberately deterministic and explainable. It uses synthetic employee skills, performance, potential, aspiration, mobility and availability data to simulate AI-enabled HR recommendations. Consequential decisions such as promotions remain human-owned in the UI and messaging.
