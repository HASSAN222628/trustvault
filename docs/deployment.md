# Deployment (verify against current Supabase/Vercel docs; limits and key names change)

1. `git init && git add . && git commit`; push to GitHub (check `git status` shows no `.env`).
2. Supabase: create project → `supabase link --project-ref <ref>` → `supabase db push` (migrations only; **do not run seed.sql in production**).
3. Create the first admin in SQL editor: `update public.profiles set role='admin' where email='you@company.com';`
4. Secrets: set an exact comma-separated CORS allow-list for each app origin, for example `supabase secrets set ALLOWED_ORIGINS=http://localhost:5174,http://127.0.0.1:5174,http://localhost:5176,http://127.0.0.1:5176,https://your-app.vercel.app MAX_UPLOAD_BYTES=5242880`. URL/anon/service keys are injected automatically. Do not use `*`.
5. `supabase functions deploy` (all 9). Confirm the functions appear in the project's Edge Functions dashboard. Check the current Edge Function request-size/memory limits before raising `MAX_UPLOAD_BYTES`.
6. Auth settings: enable email confirmation, set Site URL + redirect URLs to the Vercel domain, min password length 10.
7. Vercel: import repo, framework Vite, env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` only. `vercel.json` adds CSP/headers.
8. Smoke test: sign up two users; A uploads and searches for B by name/email; read access previews only, edit access may download and edit; A changes edit to read or revokes; verify the next request is denied as appropriate; admin sees events and "Verify hash chain" is intact; store head hash externally.
9. Security checklist: RLS enabled on 4 tables ✔ · bucket private ✔ · no `VITE_` secrets · CORS list exact · seed not applied · audit head hash exported.
   Rollback: migrations are forward-only; write a new migration to revert. Never edit applied migrations.

### Windows PowerShell deployment

From the project folder, after installing the Supabase CLI and replacing `<project-ref>` and the
production origin with your own values:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase secrets set "ALLOWED_ORIGINS=http://localhost:5174,http://127.0.0.1:5174,http://localhost:5176,http://127.0.0.1:5176,https://your-app.vercel.app" "MAX_UPLOAD_BYTES=5242880"
npx supabase functions deploy
```

The migration adds `rpc_search_share_recipients`; deploying the Edge Functions publishes upload and
sharing endpoints. Include every exact browser origin you use (scheme, host, and port) in
`ALLOWED_ORIGINS`, or browsers will block function calls during CORS preflight.
