/**
 * Server Entry Point
 * Starts the HTTP server. All app configuration lives in app.js.
 */

const app = require("./app");

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`\n🚀  Finance API  → http://localhost:${PORT}/api`);
  console.log(`🖥️   Dashboard UI → http://localhost:${PORT}`);
  console.log(`🌱  First time?  → node src/config/seed.js\n`);
});

// Graceful shutdown – ensures SQLite WAL is flushed before exit
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\nSIGINT received. Shutting down...");
  server.close(() => process.exit(0));
});
