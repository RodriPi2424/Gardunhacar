# Supabase Setup (This Project)

## 1) Create your local env file
Create a `.env` file in this folder (same level as `server.js`) and copy from `.env.example`.

## 2) Add your Supabase Postgres URL
In Supabase dashboard:
1. Open your project
2. Go to **Project Settings -> Database**
3. Under **Connection string**, choose **URI**
4. Copy the connection string and paste it as `DATABASE_URL` in `.env`

Example:
`DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require`

## 3) Start the app
Run:
`npm start`

## 4) Verify database connection
Open:
`http://localhost:3000/api/db/health`

If connected, you should get `{ "ok": true, ... }`.

## 5) Set up test drive email notifications
This project sends test drive request notifications with Resend from the Node backend.

1. Create or open your Resend account.
2. Create an API key and add it to `.env`:
   `RESEND_API_KEY=re_...`
3. Choose the sender:
   - Quick test sender: `RESEND_FROM_EMAIL=Autenticar <onboarding@resend.dev>`
   - Production sender: `RESEND_FROM_EMAIL=Autenticar <noreply@autenticar.pt>`
4. If using `noreply@autenticar.pt`, verify `autenticar.pt` in Resend and add the DNS records Resend gives you.
5. Set where notifications should arrive:
   `TEST_DRIVE_NOTIFICATION_EMAIL=rodrigo.pinto@autenticar.pt`
6. Restart the backend:
   `npm start`

Verify email config:
`http://localhost:3000/api/test-drive-email/status`

You should see `"configured": true`. If it is false, the response lists the missing `.env` keys.

## Notes
- This backend auto-creates `public.users` on first register request.
- `node_modules/` and `.env` stay out of git by default.
- Test drive email only sends when the Node/Express backend is running. The static Supabase fallback can save requests, but it cannot safely send email because the Resend API key must stay server-side.
- If your connection fails, double-check password and project ref in `DATABASE_URL`.
