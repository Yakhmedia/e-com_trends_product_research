# SENTRY_GUIDE.md

## Quick Start – Sentry for Error Reporting

1. **Create a Sentry account**
   - Go to https://sentry.io and sign up with your email or GitHub.
   - Verify your email address.

2. **Create a new project**
   - Choose **JavaScript** → **Next.js** (or the framework you use).
   - Give the project a name, e.g., `e‑com‑trends‑product‑research`.
   - Click **Create Project**. Sentry will provide a DSN (Data Source Name).

3. **Install the SDK** (npm example)
   ```bash
   npm install @sentry/nextjs
   ```

4. **Initialize Sentry in your code** (e.g., `src/pages/_app.tsx`)
   ```javascript
   import * as Sentry from "@sentry/nextjs";

   Sentry.init({
     dsn: "YOUR_DSN_HERE",
     // Adjust this value in production
     tracesSampleRate: 1.0,
   });
   ```

5. **Verify**
   - Run the app locally and trigger a test error:
     ```javascript
     Sentry.captureException(new Error("Test error from Sentry"));
     ```
   - Check the Sentry dashboard – the event should appear within seconds.

6. **Optional – Source Maps**
   - Upload source maps to get readable stack traces in production.
   - Follow Sentry's docs for your bundler (Webpack, Vite, etc.).

---

*Keep this file version‑controlled so the whole team can onboard quickly.*
