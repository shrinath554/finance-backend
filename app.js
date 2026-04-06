/**
 * Express App
 * Configures middleware, mounts routes, and attaches the global error handler.
 * Kept separate from server.js so tests can import the app without binding a port.
 */

const express      = require("express");
const cors         = require("cors");
const path         = require("path");
const routes       = require("./src/routes");
const { errorHandler } = require("./src/middleware/errorHandler");

const app = express();

// ── Core Middleware ────────────────────────────────────────────────────────────
app.use(cors());                        // Enable CORS for all origins (adjust in prod)
app.use(express.json());                // Parse JSON request bodies
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded bodies

// ── Request Logger (dev only) ─────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// ── Static UI ─────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api", routes);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// ── Global Error Handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

module.exports = app;
