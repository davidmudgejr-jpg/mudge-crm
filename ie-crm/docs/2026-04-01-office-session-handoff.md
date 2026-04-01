# Office Session Handoff — April 1, 2026

## What We Did Today

### 1. Ceres Business Park Brochure
Pulled up the Ceres Business Park brochure from Sarah Work > Building Listings in Dropbox. 16510-16624 Ceres Avenue, Fontana — 9 available units, $1.60/SF lease rate.

### 2. Outlook Hotkey Fix
Remapped Cmd+N in Outlook from "New Message" to "New Main Window" via macOS keyboard shortcuts. The menu item was buried under File > New > Main Window. Used:
```
defaults write com.microsoft.Outlook NSUserKeyEquivalents -dict-add "Main Window" -string "@n"
```

### 3. Universal Duplicate Detection System (Big Build)
Built a complete fuzzy matching / duplicate detection system across the entire CRM. This was driven by Houston Command's feedback — AIR ingest was creating ~15 duplicate records every morning.

**Phase 1.5 — AIR Ingest Fix (urgent, deployed):**
- Root cause: dedup queries used `air_sheet_date` (changes daily) instead of `air_entry_number`
- Fixed all 4 dedup queries (market_tracking lease/sale, lease_comps, sale_comps) to use `air_entry_number` first with address fallback
- Added UNIQUE partial indexes via migration 048 (already applied to Neon)
- Upgraded `findOrCreateProperty` to use compositeMatcher for fuzzy address matching
- Properties loaded once per ingest batch and reused

**Phase 1 — Universal `POST /api/db/create` endpoint:**
- New server endpoint with compositeMatcher duplicate detection for contacts, properties, companies
- Returns `{ duplicateWarning, match, candidates }` when potential dupes found
- Supports `skipDuplicateCheck` flag for force-create

**Phase 2 — Frontend API rewire:**
- All create functions (createProperty, createContact, createCompany, etc.) now route through `/api/db/create`
- Also fixes broken browser-mode creates (SELECT-only lock was blocking INSERTs)

**Phase 3 — Duplicate Warning UI:**
- New `DuplicateWarning.jsx` component with confidence scoring
- Integrated into `QuickAddModal` — shows "Use This" / "Create Anyway" / "Back"

**Phase 4 — AI endpoint matching:**
- `POST /sandbox/contact` checks against live DB AND pending sandbox before inserting
- `POST /queue/approve` (contacts) checks for dupes before promoting to live
- AIR ingest findOrCreateProperty uses compositeMatcher

**Files changed:** server/index.js, server/routes/ai.js, src/api/bridge.js, src/api/database.js, src/components/shared/QuickAddModal.jsx, src/components/shared/DuplicateWarning.jsx (new), migrations/048_air_dedup_constraints.sql (new)

**Committed and pushed to main.** Houston Command notified via directives table.

### 4. Cross-Machine Memory Sync System (Built, needs install)
Built a system to sync Claude Code memory across all three machines via Neon:
- New `claude_code_memory` table in Neon (created)
- Sync script: `scripts/sync-claude-memory.js` (pull/push/sync)
- Install script: `scripts/install-memory-sync.sh`
- Hooks: auto-pull on session start, auto-push on session end
- Merge strategy: additive, timestamp-based (never deletes, newer wins)

**This machine's memory has been pushed to Neon.** Home machine needs to seed its richer memory — see setup instructions below.

---

## Setup Commands for Each Machine

### Home Machine (do this FIRST — has the richest memory):
```bash
cd ~/Desktop/ClaudeCustomCRM-real/ie-crm
git pull origin main
bash scripts/install-memory-sync.sh
node scripts/sync-claude-memory.js push    # Seeds Neon with home machine's full memory
node scripts/sync-claude-memory.js pull    # Pulls the 2 files from office machine
```

### Office Machine (already done):
```bash
# Already pushed. Just install the hook:
cd ~/Desktop/ClaudeCustomCRM-real/ie-crm
bash scripts/install-memory-sync.sh
```

### Laptop:
```bash
cd ~/Desktop/ClaudeCustomCRM-real/ie-crm
git pull origin main
bash scripts/install-memory-sync.sh
node scripts/sync-claude-memory.js pull    # Gets all memory from Neon
```

### After all machines are set up:
Memory syncs automatically. No commands needed — hooks handle it.

---

## Action Items for Houston Command
- Rerun today's AIR ingest to verify zero duplicates
- Deploy updated server (code is pushed to main)
