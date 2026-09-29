# COOKd Kitchen ColdCheck (aka Night Shift)

Temperature monitoring for independent restaurants. Night Shift watches every
cooler, freezer, and hot well, texts the owner the moment something leaves the
safe zone, and writes inspection-ready logs automatically.

## Run it on your computer

1. Install Node.js (LTS version) from https://nodejs.org if you have not already.
2. Open PowerShell in this folder and run:

       npm install
       npm run dev

3. Open the address it prints (usually http://localhost:5173).

Pages:
- index.html      Landing page with pricing and the free-trial request form
- login.html      Log in (demo password is set in src/js/config.js)
- dashboard.html  The ColdCheck dashboard. Add ?demo=1 to skip the login.

## Change the colors

Open `src/styles/theme.css`. The BRAND section holds the colors you can swap
for your project colors. Leave the TEMPERATURE section alone so cold/safe
stays blue and alarms stay red.

## Change business details

Open `src/js/config.js` to set your sales email, phone, price, and demo password.
Trial requests from the landing page open an email to `salesEmail`.

## Put it on GitHub Pages

1. Create a new empty repository on GitHub (for example `cookd-kitchen`).
2. In this folder run:

       git init
       git add .
       git commit -m "ColdCheck website"
       git branch -M main
       git remote add origin https://github.com/YOUR-USERNAME/cookd-kitchen.git
       git push -u origin main

3. On GitHub go to Settings > Pages and set Source to "GitHub Actions".
   Every push to `main` now rebuilds and publishes the site automatically.

## Use your own domain

1. Buy a domain from any registrar.
2. On GitHub: Settings > Pages > Custom domain. Enter it and save.
3. At your registrar add these DNS records:
   - Four A records for the bare domain pointing to:
     185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
   - A CNAME record for `www` pointing to YOUR-USERNAME.github.io
4. Back on GitHub, tick "Enforce HTTPS" once it becomes available.

## What is real and what is demo right now

Real: the website, all pages, the design, the dashboard, checklists, logs view,
and the trial request form (it opens an email).

Demo only: logins, alert contacts, and temperature readings. They live in the
browser on one device. GitHub Pages cannot run a server, so these need a backend:

- Accounts and database: Supabase or Firebase (both have free tiers)
- Text alerts: Twilio or a similar SMS service
- Email alerts: Resend, SendGrid, or similar
- Sensor readings: pick one Wi-Fi sensor brand with an open API, then a small
  server function pulls readings every few minutes and saves them
- Sensor checks and alerts must run on a server 24/7, not in the browser

The code marks these spots with "BACKEND:" comments.