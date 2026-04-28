# 🐟 FZFish — Feng Lab Zebrafish Inventory

A web-based zebrafish colony manager for Feng Lab, built on Google Sheets and Google Drive. Track tanks, filter by markers and status, scan barcodes, attach photos, and organize tanks into named experiments — all synced to a shared Google Sheet in real time.

**Live app:** [marcibo.github.io/fengLabZfishInventory](https://marcibo.github.io/fengLabZfishInventory/)

> ⚠️ **Please do not edit the Google Sheet directly.** All changes should be made through the app — editing the sheet manually can break the inventory for everyone.

---

## Quick Start

### 🔐 Signing In

Click **Sign in with Google** using your lab Google account that has access to the shared inventory sheet. Your session stays active until you sign out. Use **Test Mode** to explore without saving anything.

Need access? [Request it here](https://docs.google.com/forms/d/e/1FAIpQLSeIfXMJv0xoscLQZt9HayQppR0_R46Szo6mrpLPrAVnqHwtZQ/viewform?usp=publish-editor) or email [marvilla@bu.edu](mailto:marvilla@bu.edu).

---

### ➕ Adding a Tank

Click **+ Add Tank** (desktop) or the **+** button (bottom-right on mobile). You may also scan a barcode to begin adding.

- Scan the barcode with 📷 *(the barcode text is in the bottom-left of the label!)*. Fish in the incubator will auto-generate a Tank ID — but **please attach barcodes as soon as possible**.
- Fill in the line name using **A:b;C:D x Z** formatting  
  *(e.g. `dbh:eGFP;CD4:mCherry x CD8:eGFP`)*
- Add the genotype using **+;-/?** formatting  
  *(e.g. `dbh+, CD4−, CD8?`)*
- Input locations as **Rx Sy** or **Nx Sy** where R/N = rack or nursery, S = shelf number counting up from the ground.
- Add any important notes, including uncertain genes.

---

### 🧬 Markers

- **Positive markers** (green tags) — transgenes **confirmed present**
- **Negative markers** (red tags) — transgenes **confirmed absent**

Add them via the dropdown pickers when editing a tank. Once a marker exists on any tank it becomes a filter option across the app.

For uncertain genes, add them to notes as **`Gene?`** — they are indexed by search and will show up.

---

### 🏷️ Status

Set the tank's status when adding or editing. Used to filter the inventory:

| Status | Meaning |
|---|---|
| **Active** | Adult fish living on the rack |
| **Nursery** | Fish in the nursery system |
| **Incubator** | Embryos or early larvae in the incubator |
| **Low Stock** | Fewer fish than desired; flagged for expansion |
| **Breeding** | Currently set up in a breeding cross |
| **Archived** | No longer active; kept for record |

---

### 🏞️ Pictures

Please add photos at each stage — **including embryo plates** — to make the inventory useful for anyone who works on your project. Photos are automatically saved to the shared Google Drive folder.

---

### 📷 Barcode Scanning

Tap the 📷 icon in the header to scan a tank barcode. The app will jump straight to that tank or start a new tank entry. You can also scan while adding or editing a tank to fill in the Tank ID automatically.

---

### ✏️ Editing, Moving & Deleting

Click any tank card to open the detail panel. From there you can **Edit** all fields or **Delete** the tank. Changes sync to the Google Sheet immediately.

**If you move a tank, update its status and location in the inventory.** All changes are also written to a `Changelog` tab on the sheet.

---

### 🔍 Searching & Filtering

- **Search bar** — finds tanks by line, genotype, location, notes, or marker
- **Status chips** — filter by Active, Nursery, Incubator, etc. (multi-select)
- **+Markers / −Markers** — filter by confirmed presence or absence of transgenes
- **Sort** — sort by line name, fertilization date, count, or last updated
- On mobile, tap **⚙ Filters** to access all options in a bottom sheet

---

### 🧪 Experiments

Use **🧪 ▾** in the header to create or open a named experiment. Experiments are collections of tanks stored as separate tabs in the same Google Sheet — useful for grouping tanks by project or cross.

- **+ New** — create a new experiment
- **+ Add Tanks** — pick tanks from the inventory using the search/filter picker
- **✕ Remove** on a card — remove a tank from the experiment without deleting it
- **✏️** in the experiment bar — rename the experiment inline
- **✕ Exit** — return to the full inventory

You can also add a tank to any experiment directly from its detail drawer.

---

### ⟳ Syncing

Click **⟳** to pull the latest data from the Google Sheet. The app syncs automatically on sign-in. All edits are written directly to the sheet — no manual export needed.

---

## Tech Stack

- **Frontend:** Vanilla JS, HTML, CSS — no framework, no build step
- **Auth:** Google Identity Services (OAuth 2.0)
- **Storage:** Google Sheets API v4 (inventory + experiments + changelog)
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

## Contact

For access requests, bug reports, or questions:
- 📋 [Access request form](https://docs.google.com/forms/d/e/1FAIpQLSeIfXMJv0xoscLQZt9HayQppR0_R46Szo6mrpLPrAVnqHwtZQ/viewform?usp=publish-editor)
- ✉️ [marvilla@bu.edu](mailto:marvilla@bu.edu)
