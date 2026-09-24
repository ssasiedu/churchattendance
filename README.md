# Church Management System

Attendance, membership, bulk SMS, church accounts and fixed assets — built for a local church and run from a phone or a laptop.

Stack: React + Vite, Tailwind CSS v4, Supabase (Postgres, Auth, Storage, Edge Functions).

---

## What's inside

**Attendance**
- Members scan a QR code at the entrance, find their name and tap **Check in**. No login, no app to install.
- One permanent entrance QR code that always opens whichever service is currently open.
- End-of-service report: who was present, who was absent, attendance rate, a breakdown by group, CSV export and a clean printout.
- Dashboard with monthly trends, a follow-up list of members who have missed the last few services, and a membership analytics tab: gender, group, ministry, membership status, age, marital status, how the church has grown, and how complete your records are.

**Members**
- Full member records: photo, group, phone numbers, email, date of birth, marital status, ministries, membership status, addresses, baptism date, talents, emergency contact.
- **Group is required** on every member and drives reporting, SMS and the dashboard.
- Member profile page with attendance rate, giving totals and payment history.
- CSV import and export.

**Billing and balances**
- Bill welfare to every active member in one batch, monthly or whenever you choose.
- Raise a special contribution (a building fund, a harvest levy) and every active member is billed for it.
- Each member's balance is tracked: billed, paid, outstanding — with a defaulters list and a one-tap SMS reminder.
- Billing posts receivables against the income account, and payments then clear that receivable, so the books stay right.

**Users and roles**
- Administrator, Finance Manager, Group Leader, Ministry Leader and Usher come ready-made, and you can create your own.
- An administrator ticks exactly what each role may do, and the database enforces it, not just the menus.
- A group leader only sees their own group; a ministry leader only their ministry.

**Bulk SMS (Hubtel)**
- Send to all members, the absentees of a service, the people present at a service, the follow-up list, one group, or numbers you type in.
- Personalise with `{name}` and `{church}`; live character and SMS-part counter.
- Credentials are stored in the database and only read on the server, never in the browser.
- Delivery history with sent and failed counts, plus a test-send button.
- Automatic messages: a receipt with the member's new balance after every payment, and birthday wishes on the day.

**Accounting**
- Chart of accounts you control, with live balances.
- Record tithes, welfare and special contributions per member; record offerings and donations generally.
- Record expenses. Every contribution and expense posts a double entry automatically.
- Manual journal entries for receivables, payables and corrections — the system refuses anything that doesn't balance.
- Reports: income and expenditure, trial balance, account ledger with running balance, and what each member has paid.

**Fixed assets**
- Asset register with cost, quantity, location, custodian, condition and status.
- Straight-line depreciation and net book value, and an option to post the purchase to the accounts.

**Setup**
- Church profile: name, address, location, contact details, currency and logo — the logo flows through the check-in page, the interface and every printed report.
- Every dropdown in the system is editable by the administrator.

---

## Getting it running

### 1. Create the database

In your Supabase project: **SQL Editor → New query**, paste the whole of `supabase/schema.sql` and run it.

The file is safe to run more than once. Running it on an existing v1 database upgrades it in place — your members, services and attendance are untouched.

### 2. Load the member register (optional)

`supabase/import-members.sql` holds the 306 members from the COP Salem Assembly spreadsheet. Paste it into a **new** SQL Editor tab and run it once, after `schema.sql`. Groups are matched by name and created if missing.

To start the register over: `delete from public.members;` and run the file again.

You can also import from a spreadsheet inside the app: **Members → Import CSV** (see `supabase/sample-members.csv` for the columns).

### 3. Deploy the SMS function

Bulk SMS goes through a small server-side function so your Hubtel credentials never reach anyone's browser.

Deploy two functions the same way — Supabase → **Edge Functions** → *Deploy a new function*, name it exactly as below, paste the file, Deploy:

| Function name | File | What it does |
|---|---|---|
| `send-sms` | `supabase/functions/send-sms/index.ts` | Bulk messages, payment receipts and birthday wishes |
| `manage-users` | `supabase/functions/manage-users/index.ts` | Creates and removes logins from the Users page |

**Or with the CLI:**

```bash
supabase functions deploy send-sms
supabase functions deploy manage-users
```

Nothing else to configure: they read the project URL and keys from the environment Supabase already provides.

### 4. Create your admin account

**Authentication → Users → Add user**, tick *Auto Confirm User*, then in the SQL Editor:

```sql
insert into public.admins (user_id, full_name)
select id, 'Your Name' from auth.users where email = 'you@example.com';
```

Repeat for each person who should have access. Give everyone their own login rather than sharing one.

### 5. Run the app

```bash
npm install
cp .env.example .env     # then paste your Supabase URL and anon key
npm run dev
```

On Windows PowerShell, if `npm` is blocked, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use Command Prompt.

### 6. Set up the church

Sign in and go to **Settings**:

1. **Church profile** — name, address, location, currency, and upload your logo.
2. **SMS** — paste your Hubtel Client ID, Client Secret and approved Sender ID, then switch SMS on.
3. **Groups** — create or rename your groups and set their leaders.
4. **Payment types** — link Tithe, Welfare and Special Contribution to the income and cash accounts they should hit.
5. **Dropdowns** — adjust any list in the system: ministries, departments, service types, asset categories and so on.
6. **Users and roles** — add your finance manager, group leaders and ushers, and tick what each role may do.
7. **Automatic messages** — turn on payment receipts and birthday wishes, and adjust the wording.

To have birthday wishes go out on their own every morning, generate a secret under **Settings → Automatic messages**, then paste it and your project ref into `supabase/schedule-birthdays.sql` and run that file in the SQL editor. Without it, you still send them with one tap from the Birthdays page.

---

## Deploying

Works on Netlify, Vercel or any static host.

- Build command `npm run build`, publish directory `dist`.
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Do **not** mark them as secret — Vite bakes `VITE_` variables into the bundle at build time, and the secret scanner will fail the build.
- After changing an environment variable, redeploy with **Clear cache and deploy site**; Vite only reads them while building.
- If a colleague sees "You don't have access to this site", the site is set to private in your host's settings.

`vercel.json` (included) and Netlify's default SPA handling send every route back to `index.html`, which is what the check-in links need.

---

## How the money side works

Every payment you record creates a balanced double entry, so the books are always in step with the register:

| You record | Debit | Credit |
|---|---|---|
| A tithe of GH₵100 | Cash on Hand | Tithes |
| Welfare of GH₵20 billed to 300 members | Receivables | Welfare Contributions |
| A member paying GH₵20 of welfare they were billed | Cash on Hand | Receivables |
| A welfare payment from someone never billed | Cash on Hand | Welfare Contributions |
| An expense of GH₵50 for fuel | Transport and Fuel | Cash on Hand |
| An asset purchase (when you tick *post to accounts*) | the asset account | Cash on Hand |

Income is recognised when the bill is raised, so paying it later settles the debt rather than counting twice. A member's balance is simply everything billed to them minus everything they have paid, and the oldest bill is treated as settled first.

Receivables, payables and corrections go through **Journal entries**, where you choose the accounts yourself. The system will not post an entry whose debits and credits differ.

If a payment type has no accounts linked yet, the payment is still recorded — it simply isn't posted until you link the accounts under **Settings → Payment types**.

---

## Security

- Members who check in are anonymous. They can only call two database functions: one that lists names for an open service, and one that marks a person present. They cannot read phone numbers, giving records or anything else.
- Every table is behind row level security and only users listed in `public.admins` can read or write.
- SMS credentials are read only by the `send-sms` function running on Supabase's servers, which also verifies that the caller is an administrator.
- Roles are enforced in the database itself: a group leader's browser cannot read another group's members even if someone changed the code.
- Creating logins happens in the `manage-users` function on the server, so the admin key never reaches a browser.
- Never put your `service_role` key in `.env` or anywhere in this app.

---

## Project layout

```
src/
  pages/        Dashboard, CheckIn, Services, Members, MemberProfile, Reports, Sms,
                Birthdays, Contributions, Billing, Expenses, ChartOfAccounts, Journal,
                FinanceReports, Assets, Settings, Login
  components/   Layout, Modal, PhotoUpload, RequirePermission, shared UI primitives
  context/      AuthContext (session), SettingsContext (church profile, role, dropdowns, accounts)
  lib/          supabase client, SMS helper, formatting and CSV helpers
supabase/
  schema.sql                 the whole database, safe to re-run
  import-members.sql         the 306 real members, run once
  sample-members.csv         template for the in-app CSV import
  schedule-birthdays.sql     optional daily birthday job
  functions/send-sms/        bulk SMS, receipts and birthday wishes
  functions/manage-users/    creates and removes logins
```
