# Church Attendance

A simple web app for taking church attendance with QR codes, built with **React + Vite**, **Tailwind CSS v4** and **Supabase**.

## What it does

| Use case | Where |
|---|---|
| Member scans a QR code, browses the list (A–Z) and taps their name to check in | `/checkin` or `/checkin/<serviceId>` |
| Member with the page open on a phone types their name and checks in | Same page, search box at the top |
| End-of-service report of who was present and absent, with CSV export and print | Admin → **Reports** |
| Monthly attendance trends by age group, gender, membership and department, plus a follow-up list | Admin → **Dashboard** |

Admins can also add/edit/import members, open and close services, print QR codes, and mark people present or remove a check-in by hand.

## Setup (about 10 minutes)

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com), create a free project and wait for it to finish provisioning.

### 2. Create the database
In Supabase open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and click **Run**.

Optional: run `supabase/seed.sql` too. It adds 40 demo members and six months of services with attendance so the dashboard has data to show. You can remove it later with:
```sql
truncate public.attendance, public.services, public.members cascade;
```

### 3. Create your admin login
**Authentication → Users → Add user → Create new user.** Enter your email and a password, and tick *Auto confirm user*.

### 4. Make that user an admin
Back in the SQL Editor run (with your email):
```sql
insert into public.admins (user_id)
select id from auth.users where email = 'you@yourchurch.org';
```
Repeat steps 3–4 for every secretary or usher who should manage attendance. Anyone not in `admins` can sign in but can't see any data.

Recommended: **Authentication → Sign In / Providers → turn off "Allow new users to sign up"**, since admins are created by hand.

### 5. Configure and run the app
Requires Node.js 20.19+ (or 22.12+).
```bash
cp .env.example .env      # then fill in the values below
npm install
npm run dev
```
`.env` values come from **Project Settings → API** (or **API Keys**):
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your anon / publishable key
VITE_CHURCH_NAME=Your Church Name
```
Never use the `service_role` / secret key in this app.

Open http://localhost:5173 and sign in. The dev server also listens on your local network, so phones on the same Wi-Fi can reach it at `http://<your-computer-ip>:5173/checkin` for testing.

## Using it on a Sunday

1. **Services → New service.** This opens check-in and shows a QR code.
2. Print it or put it on the projector. Members scan, find their name, tap **Check in**, then **Mark present**.
3. For a code you print once and leave at the entrance, use **Entrance QR code**. It always opens the most recent open service.
4. After the service, open **Reports**, click **Close check-in**, then export CSV or print the present and absent lists.

## Deploying

Any static host works. Build with `npm run build` and deploy `dist/`.

- **Vercel:** import the repo, add the three `VITE_` environment variables, deploy. `vercel.json` handles page routing.
- **Netlify:** build command `npm run build`, publish directory `dist`, add the env variables. `public/_redirects` handles routing.

QR codes use the address the admin is viewing the site from, so generate them from the live URL, not localhost.

## How security works

- Every table has row level security. Only users listed in `admins` can read or change data.
- People checking in are not logged in. They can only call two database functions:
  - `get_checkin_data` returns the open service and member **names and departments only** (no phone numbers).
  - `mark_present` records attendance only for an open service and an active member. Duplicate check-ins are ignored.
- Closing a service stops all further self check-ins for it.

Anyone with the link can mark any name present while a service is open. That's the usual trade-off for tap-your-name check-in. Closing check-in promptly after service and reviewing the report (self check-ins vs admin entries are labelled) keeps it honest.

## How the numbers are calculated

- **Absent** means an active member who had joined on or before the service date and did not check in. Set a member's *Joined on* date so newcomers aren't counted absent for services before they arrived. Inactive members never count as absent.
- **Attendance rate** is present ÷ expected (active members who had joined by that date).
- **Needs a follow-up call** lists active members who missed three or more closed services in a row, within the selected range and service type.
- Dashboard figures are calculated in the browser. That's comfortable for a few thousand members and a year of weekly services.

## Customising

- Departments, service types, age groups and membership types live in `src/lib/constants.js`. If you change age groups, gender or membership values, update the matching `check` constraints in `schema.sql` too (departments and service types are free text in the database).
- Colours and fonts are defined in the `@theme` block of `src/index.css`.

## Importing members

**Members → Import CSV.** The file needs a header row. Only `full_name` is required; see `supabase/sample-members.csv`:
```
full_name,phone,gender,age_group,department,member_type,joined_on,is_active
```

## Project structure
```
src/
  pages/        CheckIn, Dashboard, Services, Members, Reports, Login
  components/   Layout, Modal, ProtectedRoute, ui primitives
  context/      AuthContext (session + admin check)
  lib/          supabase client, constants, helpers (CSV, dates)
supabase/       schema.sql, seed.sql, sample-members.csv
```
