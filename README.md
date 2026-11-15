# BuildPilot — Foundation MVP

First functional source-code milestone: email/password authentication, private PostgreSQL projects, dashboard, create/archive projects, and responsive UI.

## Run locally
1. Install Node.js 20+ and run `npm install`.
2. Use your existing Supabase project. If you already ran the database SQL, **do not run `supabase/schema.sql` again** (its policies/triggers are not idempotent).
3. Copy `.env.example` to `.env.local` and insert the project URL and **publishable/anon** key (never the service-role key).
4. In Supabase Authentication > URL Configuration, set the Site URL to `http://localhost:3000` and allow redirect `http://localhost:3000/reset` for local development. Configure production URLs before deployment.
5. Run `npm run dev`, then visit http://localhost:3000.
6. Sign in with the existing private user you created under Supabase Authentication > Users.

## Important security/deployment notes
- **No backend has been deployed** and no Supabase project or credentials have been created for you. The app becomes functional after the above setup.
- Supabase Row Level Security restricts each project to its owner. Avoid exposing service-role credentials.
- The public sign-up button has been removed. Keep public sign-ups disabled in Supabase Auth settings.
- For production, configure SMTP email, password policies, MFA if desired, HTTPS hosting, backups, monitoring, and rate limits. Test access isolation with two separate accounts.
- Dashboard budgets are **planned amounts**, not realized costs or profit.
- Future milestones: private photo/document storage, tasks, materials, daily logs, design catalog, 3D, AI server routes, offline sync with conflict resolution.

## Deploy on Vercel (iPhone-friendly via GitHub web UI)
1. Create a **private** GitHub repository named `buildpilot`. Upload the **contents** of `buildpilot-starter` into the repository root (`package.json` must be at root). Do not upload `.env.local`, secrets, or passwords.
2. In Vercel, choose Add New > Project > Import Git Repository, select the private repository, framework Next.js.
3. Add environment variables for **Production, Preview, Development** as needed: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (use the Supabase **publishable** or legacy **anon** key, not secret/service_role).
4. Deploy. In Supabase Authentication > URL Configuration, set **Site URL** to the exact production `https://...vercel.app` address and add `https://...vercel.app/reset` to Redirect URLs.
5. Sign in with your private user and create a test project; refresh the page and verify it persists. Check password recovery email redirects to `/reset`.
6. For real use: configure reliable SMTP, MFA, backups, monitoring, and production security review. A login page is not a substitute for these checks.

**Security:** A publishable/anon key is intended for client-side use; RLS policies enforce user data access. Never use service_role or secret keys in `NEXT_PUBLIC_` variables.
