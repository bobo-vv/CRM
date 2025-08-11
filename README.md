# Fresh CRM (Render.com)
- Express + JSON file DB (no external services)
- Static frontend in /public (Tailwind CDN + vanilla JS)
- Login: admin@example.com / admin123

## Deploy
- Build: npm install
- Start: node server.js
- Set env: DATA_DIR=/data, JWT_SECRET=<random>, ADMIN_EMAIL/ADMIN_PASSWORD (optional)
- Add Disk 5GB and mount /data
