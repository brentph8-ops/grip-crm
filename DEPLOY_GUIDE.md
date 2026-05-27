# GRIP Deployment Guide
## Supabase + Cloudflare Pages + Contractor Portal

---

## Step 1 — Create Your Supabase Project (5 min)

1. Go to **https://supabase.com** → Sign up (free)
2. Click **New project**
3. Name it `GRIP`, choose a region close to you, set a database password → **Create project**
4. Wait ~2 minutes for provisioning

---

## Step 2 — Run the Database Schema (2 min)

1. In your Supabase project → **SQL Editor** → **New query**
2. Open the file `SUPABASE_SETUP.sql` from this project folder
3. Paste the entire contents into the SQL editor
4. Click **Run**  ✓ You should see "Success. No rows returned."

---

## Step 3 — Enable Google Sign-In (3 min)

1. In Supabase → **Authentication** → **Providers** → find **Google** → toggle on
2. You need a Google OAuth Client ID and Secret:
   - Go to **https://console.cloud.google.com**
   - Create a project (or use existing)
   - APIs & Services → **Credentials** → Create Credentials → OAuth 2.0 Client ID
   - Application type: **Web application**
   - Authorized redirect URIs: add `https://xxxx.supabase.co/auth/v1/callback`
     (replace xxxx with your Supabase project ref, found in project Settings → General)
   - Copy the **Client ID** and **Client Secret** back into Supabase
3. In Supabase Authentication → **URL Configuration**, add your Cloudflare Pages domain
   to **Redirect URLs** (you'll add this after Step 6 — use `*` temporarily)

---

## Step 4 — Get Your API Keys (1 min)

1. In Supabase → **Project Settings** → **API**
2. Copy:
   - **Project URL** → looks like `https://xxxx.supabase.co`
   - **anon public** key → long string starting with `eyJhbG...`

---

## Step 5 — Add Keys to GRIP (2 min)

Open `src/supabase-client.js` and replace the placeholder values:

```js
window.GRIP_SUPABASE_URL  = "https://xxxx.supabase.co";
window.GRIP_SUPABASE_ANON = "eyJhbGc...your-full-anon-key";
```

Save the file.

---

## Step 6 — Push to GitHub (3 min)

1. Open Terminal, navigate to this folder:
   ```
   cd /Users/brentphillips/Documents/Codex/2026-04-29/can-you-build-me-a-crm
   ```
2. Initialize git and push:
   ```bash
   git init
   git add index.html src/ contractor.html SUPABASE_SETUP.sql DEPLOY_GUIDE.md .gitignore
   git commit -m "GRIP initial deploy"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/grip-crm.git
   git push -u origin main
   ```
   > Replace `YOUR_USERNAME` with your GitHub username.
   > Create the repo first at https://github.com/new (name: `grip-crm`, private)

---

## Step 7 — Deploy to Cloudflare Pages (5 min)

1. Go to **https://pages.cloudflare.com** → Log in (or create free account)
2. Click **Create a project** → **Connect to Git** → authorize GitHub → select `grip-crm`
3. Build settings:
   - **Framework preset**: None
   - **Build command**: *(leave blank)*
   - **Build output directory**: `/` (root)
4. Click **Save and Deploy**
5. In ~30 seconds your app is live at `https://grip-crm.pages.dev` (or similar)

---

## Step 8 — Update Supabase Redirect URL (1 min)

1. Copy your Cloudflare Pages URL (e.g. `https://grip-crm.pages.dev`)
2. In Supabase → **Authentication** → **URL Configuration**
3. Add it to **Redirect URLs**: `https://grip-crm.pages.dev`
4. Click **Save**

---

## Step 9 — Create Storage Bucket (2 min)

1. In Supabase → **Storage** → **New bucket**
2. Name: `grip-attachments`
3. Public: **off**
4. Click **Create bucket**
5. Go to the bucket → **Policies** → add:
   - **INSERT**: `(auth.uid()::text = (storage.foldername(name))[1])`
   - **SELECT**: `(auth.uid()::text = (storage.foldername(name))[1])`

---

## Step 10 — First Sign-In

1. Open your live GRIP URL
2. Click **Sign in with Google**
3. GRIP will ask if you want to upload your existing local data — click **OK**
4. Your data is now synced to the cloud ✓

---

## Using the Contractor Portal

Once signed in and Supabase is configured:

1. Open any Punch List → click **🔗 Contractor Portal Link**
2. The link is copied to your clipboard automatically
3. Text or email the link to your contractor
4. They open it on their phone, fill in completion notes, upload photos, and submit
5. You see their response in the **Contractor Responses** section of the punch list detail

Portal links expire after **60 days** by default (configurable in `SUPABASE_SETUP.sql`).

---

## Ongoing Updates

After any code changes, deploy by pushing to GitHub:

```bash
git add -A
git commit -m "Update description"
git push
```

Cloudflare Pages auto-deploys within ~30 seconds.

---

## Estimated Monthly Cost

| Service         | Cost         |
|-----------------|--------------|
| Cloudflare Pages | **Free**    |
| Supabase free tier | **Free** (up to 500MB DB, 1GB storage) |
| Google OAuth    | **Free**     |
| Custom domain   | ~$10–12/yr (optional) |
| **Total**       | **$0/month** |
