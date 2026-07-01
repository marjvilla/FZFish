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

### ➕ Adding a Tank

Click **+ Add Tank** (desktop) or the **+** button (bottom-right on mobile). You may also scan a barcode to begin adding.

- Scan the barcode with 📷 *(the barcode text is in the bottom-left of the label!)*. Active tanks require a valid barcode ID — **please attach barcodes as soon as possible**.
- No barcode yet? Click the **Split** button under Tank ID to auto-assign a temporary SPL-ID. A 3-day alert will remind you to add a real barcode.
- Fill in the line name using **A:b;C:D x Z** formatting  
  *(e.g. `dbh:eGFP;CD4:mCherry x CD8:eGFP`)*
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

Open the in-app help guide (click the 🐟 logo) — a **DPF Calculator** sits at the top, above the guide sections. Enter a fertilization date and, optionally, a second date to compare against (defaults to today) and it instantly calculates days post fertilization, using the same day-0-is-the-fertilization-date rule as the rest of the app.

---

### 📷 Barcode Scanning

Tap the 📷 icon in the header to scan a tank barcode. The app will jump straight to that tank or start a new tank entry. You can also scan while adding or editing a tank to fill in the Tank ID automatically.

---

### ✏️ Editing, Duplicating & Deleting

Click any tank card to open the detail panel. From there you can:

- **Edit** — modify all fields
- **Duplicate** — create a new pre-filled tank with the same line, markers, status, and location; tank ID, photo, and notes are cleared so you can fill them in fresh
- **Delete from Inventory** — permanently removes the tank *(this can't be undone)*

Changes sync to the Google Sheet immediately. **If you move a tank, update its status and location in the inventory.** All changes are also written to a `Changelog` tab on the sheet.

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

- **Search bar** — finds tanks by line, location, notes, or marker
- **Status chips** — filter by Active, Nursery, Incubator, etc. (multi-select)
- **+Markers / −Markers / ?Markers** — filter by confirmed presence, confirmed absence, or unsorted (pending) markers
- **Sort** — sort by line name, fertilization date, count, or last updated
- On mobile, tap **⚙ Filters** to access all options in a bottom sheet

---

### ☑️ Selection Mode

Tap **☑ Select** (or the select button in the header) to enter selection mode. Click individual cards or **shift-click** to range-select. From the selection bar you can:

- **Add to Experiment** — bulk-add selected tanks to any existing experiment
- **Delete** — bulk-delete selected tanks from the inventory *(this can't be undone)*

---

### 🧪 Experiments

Use **🧪 ▾** in the header to create or open a named experiment. Experiments are collections of tanks stored as separate tabs in the same Google Sheet — useful for grouping tanks by project or cross.

- **+ New** — create a new experiment
- **+ Add Tanks** — enter selection mode to pick tanks from the inventory; existing members are pre-selected
- **⬤ Group** — enter group-assignment mode: pick a color (green, red, blue, yellow) then click tanks to assign them to that sub-group
- **Group by Color** — toggle to sort cards by their assigned color group, with color-coded section headers
- **✏️** in the experiment bar — rename the experiment inline
- **📝** in the experiment bar — add or edit free-form notes about the experiment; saves automatically on blur, and the icon shows a dot when notes exist
- **Delete** — permanently deletes the experiment tab *(this can't be undone)*
- **✕ Exit** — return to the full inventory

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

- Split and Nursery ID alerts **auto-dismiss** as soon as you save a real barcode (C + 8 digits) for that tank.
- Breeding follow-up alerts open straight into the **Record offspring** flow (see below).
- From the panel you can **Snooze** an alert for 1 hour or **Dismiss** it permanently.
- Deleting a tank also dismisses all its alerts.

---

### 🔀 Breeding & Lineage

Click the **🔀** button in the header (or mobile toolbar) to open the Breeding & Lineage panel. This is where you set up crosses, track them through to offspring, and trace a tank's family tree.

#### Setting up a cross

Click **＋ New Cross**, then:

- Pick **Parent 1** by scanning its barcode (📷) or choosing it from a searchable list (📋)
- Toggle **Incross** to breed a single line against itself instead of picking a second parent
- Set the **follow-up reminder** — how many days until you're prompted to record offspring (default 7, fully editable)
- Optionally attach **setup photos** of the breeding tank and add notes — this is just a snapshot of the day, not a permanent record; photos are **automatically deleted after 3 days**
- Both parent tanks are automatically set to **Breeding** status so they show up together in that section of the inventory

#### Recording offspring

When the follow-up reminder fires (from the alert panel or the cross card itself), tap **Record offspring**. This opens a normal Add Tank form pre-filled with:

- A suggested line name (`Parent1 × Parent2`, or `Line inx.` for an incross) — **fully editable**
- A note linking back to the parent tanks

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

## Tech Stack

- **Frontend:** Vanilla JS, HTML, CSS — no framework, no build step
- **Auth:** Google Identity Services (OAuth 2.0)
- **Storage:** Google Sheets API v4 (inventory + experiments + changelog + lineage)
- **Photos:** Google Drive API v3
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
```

---

## Contact

For access requests, bug reports, or questions:
- 📋 [Access request form](https://docs.google.com/forms/d/e/1FAIpQLSeIfXMJv0xoscLQZt9HayQppR0_R46Szo6mrpLPrAVnqHwtZQ/viewform?usp=publish-editor)
- ✉️ [marvilla@bu.edu](mailto:marvilla@bu.edu)
