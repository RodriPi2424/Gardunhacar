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

## Notes
- This backend auto-creates `public.users` on first register request.
- `node_modules/` and `.env` stay out of git by default.
- If your connection fails, double-check password and project ref in `DATABASE_URL`.
