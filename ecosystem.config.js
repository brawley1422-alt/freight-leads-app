// PM2 ecosystem for Resolve Lead Factory
//
// Processes:
//   freight-leads-web   — Next.js server on :3021
//   freight-leads-cron  — runs generator/run_daily.ts at 00:30 every day
//   freight-leads-digest — runs weekly digest Sundays 07:00
//
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup            # one-time, follow the printed command

const path = require("path");

module.exports = {
  apps: [
    {
      name: "freight-leads-web",
      cwd: __dirname,
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: "3021",
        LEAD_FACTORY_DB: path.join(__dirname, "data", "leads.db"),
      },
      max_memory_restart: "800M",
    },
    {
      name: "freight-leads-cron",
      cwd: __dirname,
      script: "node_modules/.bin/tsx",
      args: "generator/run_daily.ts",
      autorestart: false,
      cron_restart: "30 0 * * *", // 00:30 every day — long enough before 7am delivery to finish 15 briefs
      env: {
        NODE_ENV: "production",
        // PM2 always fires the process once on pm2 start before the cron
        // takes over. This sentinel tells run_daily to bail unless it's
        // really inside the 00:25-01:00 window, so nothing burns claude -p
        // just because you restarted PM2 mid-afternoon.
        PM2_CRON_SCHEDULE: "30 0 * * *",
        LEAD_FACTORY_DB: path.join(__dirname, "data", "leads.db"),
      },
    },
    {
      name: "freight-leads-digest",
      cwd: __dirname,
      script: "node_modules/.bin/tsx",
      args: "generator/weekly_digest.ts --email",
      autorestart: false,
      cron_restart: "0 7 * * 0", // Sundays 07:00
      env: {
        NODE_ENV: "production",
        LEAD_FACTORY_DB: path.join(__dirname, "data", "leads.db"),
      },
    },
  ],
};
