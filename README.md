# WeatherPro
1. Install Node 18+ and MySQL, start MySQL.
2. `npm install`
3. Copy `.env.example` to `.env`, fill JWT_SECRET, a NEW OWM_KEY, ADMIN_EMAIL, DB_PASS.
4. `npm start` then open http://localhost:3000 (database + tables are created automatically).
5. Register with the ADMIN_EMAIL address to get the Admin tab (CSV download).
Nightly at 00:00 a cron job deletes searches older than RETENTION_DAYS.
