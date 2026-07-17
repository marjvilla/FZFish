# 🐟 FZFish — Feng Lab Zebrafish Inventory

**GitHub:** [github.com/marjvilla/FZFish](https://github.com/marjvilla/FZFish)  
**Live app:** [marjvilla.github.io/FZFish](https://marjvilla.github.io/FZFish/)

A web-based zebrafish colony manager for Feng Lab, built on Google Sheets and Google Drive. Track tanks, filter by markers and status, scan barcodes, attach photos, set reminders, track breeding crosses and lineage, organize tanks into named experiments, and sub-group them by color — all synced to a shared Google Sheet in real time.

> ⚠️ **Please do not edit the Google Sheet directly.** All changes should be made through the app — editing the sheet manually can break the inventory for everyone.

---

## Quick Start

### 🔐 Signing In

Click **Sign in with Google** using your **@bu.edu** Google account that has access to the shared inventory drive. Your session stays active until you sign out. Use **Test Mode** to explore without saving anything.

Need access? Email [marvilla@bu.edu](mailto:marvilla@bu.edu) or use the in-app help guide to find the access request form.

---

### 🧭 Navigation

Click the **🐟 FZFish** logo in the top-left to open the nav menu:

- **🐠 Inventory** — the full tank list
- **🔀 Breeding & Lineage** — set up and track breeding crosses, and search any tank's ancestry
- **🧪 Experiments** — create and open named tank groupings
- **📜 Recent Activity** — a read-only feed of every change made through the app (who, what, when)
- **📖 Help Guide** — this quick start guide, plus the DPF calculator

Only one section is shown at a time — switching to Inventory always shows the full, unfiltered list, even if you were inside an experiment.

---

### ➕ Adding a Tank

Click **+ Add Tank** (desktop) or the **+** button (bottom-right on mobile). You may also scan a barcode to begin adding.

- Scan the barcode with 📷 *(the barcode text is in the bottom-left of the label!)*. Active tanks require a valid barcode ID — **please attach barcodes as soon as possible**.
- No barcode yet? Click the **Split** button under Tank ID to auto-assign a temporary SPL-ID. A 3-day alert will remind you to add a real barcode.
- Fill in the line name using **A:b;C:D x Z** formatting  
  *(e.g. `dbh:eGFP;CD4:mCherry x CD8:eGFP`)*
- The fertilization date must be a complete, valid **MM/DD/YYYY** date — incomplete or impossible dates (like Feb 30) are rejected on save.
- If you enter a Tank ID that's already in use, you'll be asked to either cancel and pick a different ID, or save anyway with a `-1`/`-2`/… suffix — this creates a 7-day alert reminding you to give it a proper unique ID.
- Input locations as **Rx Sy** or **Nx Sy** where R/N = rack or nursery, S = shelf number counting up from the ground.
- In the Notes section, check **🔔 Remind me to remove mesh baffles in 7 days** if this tank is coming out of the nursery and needs baffle removal.
- Add any important notes, including uncertain genes.

---

### 🧬 Markers

- **Positive markers** (green tags) — transgenes **confirmed present**
- **Negative markers** (red tags) — transgenes **confirmed absent**
- **Unsorted markers** (gray tags) — transgenes **not yet confirmed** as present or absent; use these for fish whose genotype is still pending

Add them via the dropdown pickers when editing a tank. Once a marker exists on any tank it becomes a filter option across the app via the **+Markers**, **−Markers**, and **?Markers** dropdowns.

---

### 🏷️ Status

Set the tank's status when adding or editing. Used to filter the inventory:

| Status | Meaning |
|---|---|
| **Active** | Adult fish living on the rack |
| **Nursery** | Fish in the nursery system |
| **Incubator** | Embryos or early larvae in the incubator |
| **Breeding** | Currently set up in a breeding cross (see **🔀 Breeding & Lineage** below) |
| **Archived** | No longer active; kept for record |

---

### 🏞️ Pictures

Please add photos at each stage — **including embryo plates** — to make the inventory useful for anyone who works on your project. Photos are automatically saved to the shared Google Drive folder. Use the dot under the uploaded photo to adjust the thumbnail crop so the info tape is in frame.

---

### 🧮 DPF Calculator

Open the in-app help guide (🐟 logo → **📖 Help Guide**) — a **DPF Calculator** sits at the top, above the guide sections. Enter a fertilization date and, optionally, a second date to compare against (defaults to today) and it instantly calculates days post fertilization, using the same day-0-is-the-fertilization-date rule as the rest of the app.

---

### 📷 Barcode Scanning

Tap the 📷 icon in the header to scan a tank barcode. The app will jump straight to that tank or start a new tank entry. You can also scan while adding or editing a tank to fill in the Tank ID automatically.

---

### ✏️ Editing, Duplicating & Deleting

Click any tank card to open the detail panel. From there you can:

- **Edit** — modify all fields
- **Duplicate** — create a new pre-filled tank with the same line, markers, status, and location; tank ID, photo, and notes are cleared so you can fill them in fresh
- **Delete from Inventory** — permanently removes the tank *(this can't be undone)*
- Click the **Line name**, **Tank ID**, or **Location** in the drawer to copy it to your clipboard (look for the ⎘ icon)

Changes sync to the Google Sheet immediately. **If you move a tank, update its status and location in the inventory.** Every change — tank edits, crosses, experiment membership, groups, notes — is logged to a `Changelog` tab on the sheet, viewable in-app under **🐟 logo → 📜 Recent Activity**.

---

### 🔍 Searching & Filtering

#### Basic search
Type in the search bar to find tanks. Multiple words are treated as **AND** — all terms must match:
```
fli1 cd4          → tanks containing both "fli1" AND "cd4"
R2A active        → tanks at R2A that also match "active"
```

#### Field-prefix syntax (power users)
Prefix a term with a field name and `:` to target a specific field, regardless of the Fields selector:
```
line:fli1                  → line name contains "fli1"
id:C12345678               → exact tank ID lookup
notes:spine                → notes contain "spine"
loc:R2A                    → location is R2A
marker:eGFP                → any marker (+ / − / ?) contains "eGFP"
status:nursery             → status is Nursery
```
Mix plain terms and field prefixes freely:
```
line:fli1 notes:uncertain  → fli1 line AND notes mention "uncertain"
marker:eGFP status:active  → active tanks with eGFP marker
```

**Available prefixes:** `line:` · `id:` · `notes:` · `loc:` · `marker:` · `status:`

---

- **Search bar** — by default, plain terms match line, Tank ID, and notes. To also match location, markers, or status with plain terms, open the **Fields ▾** selector (desktop only) and enable them — or just use the `loc:` / `marker:` / `status:` prefixes above, which always work regardless of the Fields setting.
- **Status chips** — filter by Active, Nursery, Incubator, etc. (multi-select)
- **+Markers / −Markers / ?Markers** — filter by confirmed presence, confirmed absence, or unsorted (pending) markers
- **Sort** — sort by line name, fertilization date, count, or last updated
- **⬇ Export** — download whatever's currently visible as a CSV file, respecting your active search/filters. Works the same way inside an experiment — it exports just that experiment's tanks.
- On mobile, tap **⚙ Filters** to access all options in a bottom sheet

---

### ☑️ Selection Mode

Tap **☑ Select** (in the filter bar on desktop, or the mobile toolbar) to enter selection mode. Click individual cards or **shift-click** to range-select. From the selection bar you can:

- **Add to Experiment** — bulk-add selected tanks to any existing experiment
- **Delete** — bulk-delete selected tanks from the inventory *(this can't be undone)*

---

### 🧪 Experiments

Open **🐟 logo → 🧪 Experiments** to see the list of named experiments and create new ones. Experiments are collections of tanks stored as separate tabs in the same Google Sheet — useful for grouping tanks by project or cross. The list always re-loads fresh from the sheet when you open the tab, so it won't show stale data.

- **+ New Experiment** — create a new experiment
- Click an experiment in the list to open it — its tank grid loads fresh each time
- Once inside an experiment, use **⬇ Export** in the filter bar to download just that experiment's tanks as a CSV
- **+ Add Tanks** — enter selection mode to pick tanks from the inventory; existing members are pre-selected
- **⬤ Group** — opens a menu to add tanks to a color sub-group: pick a color (or "Remove from group"), then select the tanks to assign
- The colored dots on the bar next to **⬤ Group** — click one to highlight (show only) that color's tanks; click it again to show everyone. This is just a view filter and doesn't change any tank's group.
- **✏️** in the experiment bar — rename the experiment inline; click the name itself (not the pencil) to copy it
- **📅** in the experiment bar — give the experiment a date (whatever you want it to mean — start date, a target date, etc.). Shows next to the tank count in the experiments list too.
- **📝** in the experiment bar — add or edit free-form notes about the experiment; saves automatically on blur, and the icon shows a dot when notes exist
- **Delete** — permanently deletes the experiment tab *(this can't be undone)*
- **✕ Exit** — return to the experiments list

You can also add or remove a tank from any experiment directly from its detail drawer.

---

### 🔔 Alerts

Click the **🔔** button in the header (or mobile toolbar) to open the alert panel. FZFish automatically creates reminders for time-sensitive tasks:

| Alert | Trigger | Fires after |
|---|---|---|
| **Split / temp ID** | Click **Split** under Tank ID | 3 days |
| **Nursery ID** | Save a Nursery tank without a valid barcode | 3 days |
| **Baffle removal** | Check the baffle reminder in Notes | 7 days |
| **Breeding follow-up** | Set up a cross in **🔀 Breeding & Lineage** | Configurable (default 7 days) |
| **Duplicate Tank ID** | Save a tank anyway after choosing to keep a duplicate ID | 7 days |

- Split and Nursery ID alerts **auto-dismiss** as soon as you save a real barcode (C + 8 digits) for that tank.
- Duplicate Tank ID alerts **auto-dismiss** once you edit that tank to give it a unique ID.
- Breeding follow-up alerts open straight into the **Record offspring** flow (see below).
- From the panel you can **Snooze** an alert for 1 hour or **Dismiss** it permanently.
- Deleting a tank also dismisses all its alerts.
- Right after signing in, if anything needs attention you'll get a one-time toast breaking it down by type (e.g. *"3 alerts: 2 nursery barcode needed, 1 cross follow-up"*) — no need to open the panel just to see if anything's outstanding.

#### ✏️ Custom reminders

At the bottom of the Alerts panel, use **+ New reminder** to add your own — give it a title and a date/time and it shows up alongside the automatic alerts. Handy for anything FZFish doesn't already track (a feeding schedule, an equipment check, a meeting).

#### 📅 Google Calendar Sync

Every alert — automatic and custom — automatically gets a matching event on one shared **FZFish Alerts** calendar, with a popup reminder at the exact time it's due. There's no personal switch to turn this on: it runs for whichever real (non-demo) account happens to be signed in, since the calendar is shared org-wide with edit access (see setup below) rather than person-by-person. Each event's title ends with the email of whoever's account created it, so the team can tell who added it. Dismissing or snoozing an alert in the app updates or removes the calendar event to match.

Click **📅 Subscribe to Alerts** at the top of the Alerts panel to add that shared calendar to your own Google Calendar — a one-time, read-only opt-in per person. It only affects what *you* see; it grants no permissions and has nothing to do with who can push events. **Requires a one-time setup by an admin** — see [Setting up Google Calendar Sync](#setting-up-google-calendar-sync) below. Until that's done, alerts simply won't appear on the calendar.

---

### 🔀 Breeding & Lineage

Open **🐟 logo → 🔀 Breeding & Lineage**. This is where you set up crosses, track them through to offspring, and trace a tank's family tree.

#### Setting up a cross

Click **＋ New Cross**, then:

- Pick **Parent 1** by scanning its barcode (📷) or choosing it from a searchable list (📋)
- Toggle **Incross** to breed a single line against itself instead of picking a second parent
- Pick the **fertilization date** — three buttons: **Tomorrow** (the stock default, since that's the day the eggs are actually fertilized), **Today**, or **Custom** for any other date. Fully editable later via **Edit**.
- Set the **follow-up reminder** — how many days until you're prompted to record offspring (default 7, fully editable)
- Optionally attach **setup photos** of the breeding tank and add notes — this is just a snapshot of the day, not a permanent record; photos are **automatically deleted 14 days after fertilization**
- Both parent tanks are automatically set to **Breeding** status so they show up together in that section of the inventory
- Each cross card shows its Cross ID next to the setup date — click it to copy (⎘), handy for referencing a specific cross elsewhere

#### Recording offspring

When the follow-up reminder fires (from the alert panel or the cross card itself), tap **Record offspring**. This opens a normal Add Tank form pre-filled with:

- A suggested line name (`Parent1 × Parent2`, or `Line inx.` for an incross) — **fully editable**
- A note linking back to the parent tanks
- The **fertilization date**, pre-filled from the cross's own date — **fully editable**

Use **Save & Add Another** to log as many resulting tanks as you need from a single cross (e.g. splitting offspring across multiple tanks) — the form stays open and resets between saves. The cross is automatically marked **completed** once at least one offspring tank is recorded.

#### Managing a cross

From any active cross card you can:

- **Edit** — change either parent, the incross toggle, the follow-up timing, notes, or photos at any time
- **📷 Photo** — add more setup photos later
- **Mark done** — close out the cross without recording offspring
- **Cancel** — abandon the cross *(this can't be undone; any setup photos are deleted)*

#### Lineage

Every tank's detail drawer has a **🧬 Lineage** section showing:

- **Bred from** — the cross and parent tanks it came from, if any (click to jump to a parent)
- **Crosses / offspring** — any crosses this tank has been a parent in, and the offspring tanks recorded from each
- **Full ancestry** — an expandable, multi-generation family tree as far back as records go

Use **🔀 Start cross from this tank** in the drawer to jump straight into New Cross with that tank pre-filled as Parent 1.

You can also set or change which cross a tank is offspring of directly from the **Add/Edit Tank** form — a **🧬 Lineage** dropdown lets you link it to any existing cross (or unlink it entirely), independent of the Record Offspring flow. This is useful for correcting a tank's lineage after the fact or linking tanks that weren't originally recorded through Record Offspring.

---

### ⟳ Syncing

Click **⟳** to pull the latest data from the Google Sheet. The app syncs automatically on sign-in. All edits are written directly to the sheet — no manual export needed.

---

### 📲 Installing as an App

FZFish can be installed to your home screen and opens full-screen like a native app — no App Store needed.

**iPhone / iPad (Safari only):**
1. Open the site in Safari
2. Tap the **Share** button (box with arrow, bottom of screen)
3. Tap **Add to Home Screen** → **Add**

**Android (Chrome):**
1. Open the site in Chrome
2. Tap **⋮ menu** → **Add to Home screen**, or accept the **Install app** banner

**Desktop (Chrome / Edge):**
- Click the **install icon ⊕** in the address bar, or go to the browser menu → **Install FZFish**

---

### Setting up Google Calendar Sync

Calendar Sync doesn't need a separate script — FZFish talks to the Calendar API directly, the same way it already talks to Sheets and Drive. Since everyone signed in should be able to push/remove events (not just one admin), the calendar gets shared **once, org-wide**, instead of person-by-person — this assumes the lab is on a shared Google Workspace domain (e.g. everyone has an `@youruniversity.edu` account), which is how Sheets/Drive access for this app is typically set up already.

1. Open the [Google Cloud Console](https://console.cloud.google.com/) project tied to FZFish's OAuth client (the same one used for the Sheets/Drive sign-in).
2. Go to **APIs & Services → Library**, search for **Google Calendar API**, and click **Enable**.
3. Go to **APIs & Services → OAuth consent screen → Data access** (or **Scopes**, depending on the console version) and add the scope `https://www.googleapis.com/auth/calendar.events`. Save.
   - This is a *sensitive* scope, not a *restricted* one — for an internal lab tool with a small number of users, this does **not** require Google's full app verification review. If the OAuth consent screen is still in **Testing** mode, just make sure everyone who'll use the app is added under **Test users**.
4. Create the shared calendar: in [Google Calendar](https://calendar.google.com), under **Other calendars → +  → Create new calendar**, name it something like **FZFish Alerts**, and create it.
5. Get its Calendar ID: open that calendar's **Settings and sharing**, scroll to **Integrate calendar**, and copy the **Calendar ID** (looks like `abc123...@group.calendar.google.com`).
6. Share it **once, with your whole organization** instead of person-by-person: still in **Settings and sharing**, under **Access permissions for [your domain]**, check **Make available for [your domain]** and set the permission to **"Make changes to events."** Anyone signed in with an account on that domain can now push/remove events — new lab members get this automatically the moment they have an account on the domain, with nothing to re-share.
   - No Workspace domain, or a mix of personal Gmail accounts? Fall back to **Share with specific people** and add each account individually with the same "Make changes to events" permission — this is the only case that needs repeating per person.
7. Paste that Calendar ID into `app.js` as the `GCAL_ID` constant near the top of the file (it starts out blank — the feature is off until this is set).
8. **Everyone who's already signed into FZFish needs to sign out and sign back in once** — a previously-granted session doesn't automatically pick up the new Calendar permission. After that, alerts start pushing to the calendar automatically for whoever's using the app — there's no toggle to turn on.
9. Anyone who wants to *see* the alerts on their own calendar clicks **📅 Subscribe to Alerts** in the app's Alerts panel (or manually: **Other calendars → + → Subscribe to calendar**, pasting the Calendar ID from step 5). This is a one-time, read-only opt-in per person and is completely separate from step 6 — subscribing never grants write access.

With org-wide sharing (step 6), every signed-in account can push/remove events, so alerts stay in sync no matter who's using the app at the time. Subscribing (step 9) only controls who *sees* the calendar — it's optional and has no effect on syncing.

---

## Tech Stack

- **Frontend:** Vanilla JS, HTML, CSS — no framework, no build step
- **Auth:** Google Identity Services (OAuth 2.0)
- **Storage:** Google Sheets API v4 (inventory + experiments + changelog + lineage)
- **Photos:** Google Drive API v3
- **Reminders:** Google Calendar API v3 (optional, shared/subscribable Calendar Sync)
- **Barcode scanning:** [QuaggaJS](https://github.com/serratus/quaggaJS)
- **Hosting:** GitHub Pages

---

## Project Structure

```
├── index.html   # App shell and all overlays/modals
├── app.js       # All application logic
├── style.css    # All styles
└── README.md
```

---

## Dev / Admin Console Commands

These are intentionally not auto-triggered. Open the browser console on the live app and run them when needed.

```js
// Re-run the location format migration wizard
// Flags tanks whose location doesn't match the Rx Sy / Nx Sy format
checkLocationMigration()

// Re-run the unsorted markers migration wizard
// Flags tanks whose unsorted field still contains genotype-style notation
// (values containing +, -, ?, ;, /, or the word "unsort")
checkUnsortedMigration()

// Scan all loaded tanks for tank IDs shared by more than one tank
// Logs each duplicated ID and the tanks using it to the console
checkDuplicateTankIds()
```

---

## Contact

For access requests, bug reports, or questions:
- 📋 [Access request form](https://docs.google.com/forms/d/e/1FAIpQLSeIfXMJv0xoscLQZt9HayQppR0_R46Szo6mrpLPrAVnqHwtZQ/viewform?usp=publish-editor)
- ✉️ [marvilla@bu.edu](mailto:marvilla@bu.edu)
