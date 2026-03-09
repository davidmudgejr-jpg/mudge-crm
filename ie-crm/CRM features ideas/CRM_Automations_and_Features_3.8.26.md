# CRM Automations & Features Roadmap
**Date:** March 8, 2026  
**Project:** Custom CRM for Industrial Commercial Real Estate — Inland Empire  
**Team:** David + Dad + Sister (Leanne Associates)

---

## Current Schema (Phase 1)

- **Properties** — linked to companies, contacts, comps, deals
- **Companies** — linked to properties and contacts
- **Contacts** — linked to companies, properties, deals
- **Deals** — stages: Prospects → Active → Under Contract → Closed → Lost; includes commission values and deal source tracking
- **Activity Log** — running log of calls, notes, emails; linked to contacts/deals/properties
- **To-Do List** — task management
- **Comps** — lease and sale comps tied to properties

---

## Phase 1 Priorities

- Lock in schema and relationships
- Test CSV importer with ~100 records per tab (CoStar data, Airtable export, company lease comps, loan maturity data from title reps)
- Validate fuzzy address matching on imports
- Mass migration from Airtable once test run is clean

---

## Features Already Built or Planned

### TD Master Score List
- Scores properties by transaction likelihood
- Data points: loan maturity dates, lease expirations, last sale date, commission value
- Tells you who to contact (tenant vs. owner) based on trigger event
- Built as Excel function sheet — consider integrating scoring directly into CRM Properties tab

### Deal Pipeline View
- Already segmented by stage in Deals tab
- Add summary/rollup at top: pipeline totals by stage, weighted forecast by commission value
- Goal: identify where deals are getting stuck

### Deal Source Tracker
- Already tracking deal source in Deals tab
- Future: pie chart / bar chart showing deals and commission value by source

### Dropbox File Integration
- Link property and deal records directly to corresponding Dropbox folders
- One-click access to all files for a given property or deal

### One-Click Report Generation
- Button on Properties page to generate from selected properties:
  - Lease comps report
  - Property brochure
  - BOV (Broker Opinion of Value)
  - Lease vs. Buy analysis

### Activity Log + Email Logging
- Auto-log calls and notes to contacts/deals
- **Email webhook integration:** auto-log inbound/outbound emails to matching contact records
  - Recommended: set up dedicated CRM email (separate from company Outlook)
  - Forward hot sheets and key threads to CRM email
  - Set up Outlook rules to auto-forward incoming emails from key contacts
  - Build direct webhook from CRM email inbox to Neon database (avoid Zapier for latency/cost)

### Shared Team Calendar
- Pull Outlook calendars for David, Dad, and Sister into one unified calendar view
- Goal: visibility into team availability without chasing people down

---

## Automations Roadmap (Phase 2+)

### Hot Sheet / AIR Super Sheet Auto-Parser
- **Trigger:** Daily email from AIR with industrial market updates forwarded to CRM email
- **Flow:**
  1. Agent detects new hot sheet email
  2. Downloads attached PDF
  3. Claude parses PDF — extracts address, sale/lease price, property type, date, etc.
  4. Fuzzy address matching against Properties table
  5. Auto-updates Comps table
  6. Flags low-confidence matches for manual review (see Notifications)
- **Result:** Database stays fresh daily without manual CoStar pulls

### Follow-Up Reminder Automation
- No activity logged for an active contact in 30+ days → trigger notification
- Surface in daily briefing or Claude team chat

### Deal Stage Stall Alerts
- Deal hasn't moved stages in X days → flag it
- Prompt team to take action or reassess

### Lease Expiration & Loan Maturity Alerts
- Pull from TD Master Score data
- Auto-surface upcoming triggers in daily briefing
- Suggest who to contact (tenant vs. owner)

### Post-Close Follow-Up Automation
- After closing a deal, check if client/owner has other nearby properties with upcoming triggers
- Surface as a follow-up recommendation

---

## Claude AI Team Chat Feature (Phase 3)

### Concept: Claude as the "4th Team Member"
- Chat interface embedded in CRM, accessible to David, Dad, and Sister
- Claude has full context: properties, contacts, deals, activity log
- Can answer: "What's the status of the Fontana deal?" or "When did we last talk to John Smith?"

### Key Capabilities
- **Daily Briefing:** Auto-generated each morning:
  - Deals moving / stalled
  - Upcoming lease expirations / loan maturities
  - Tasks due
  - New hot sheet updates
- **Action Detection:** Listens for action items in team chat
  - Surfaces prompt: "Do you want to add this as a to-do?" → Yes / No
- **Notification Surfacing:** Flags items needing manual review

### Build Order
- Build AFTER schema is validated and Airtable migration is complete
- Clean data is critical for Claude to work reliably

---

## Notifications System

### Recommended Approach: Bell Icon
- Bell icon in top corner of CRM UI
- Bubble with unread count
- Dropdown expands to show recent notifications
- Upgrade to full Notifications tab later if volume warrants it

### Notification Types
- Flagged hot sheet matches (agent unsure of property match)
- Failed or partial CSV imports
- Stalled deals
- Follow-up reminders
- Lease/loan maturity alerts
- Post-close follow-up suggestions

---

## Infrastructure Notes

- **Frontend:** Vercel
- **Backend:** Railway
- **Database:** Neon (Postgres)
- **Key concern:** Index high-query fields (contact_id, deal_id, property_id) as data scales — especially once email logging is live
- **Email:** Set up dedicated CRM email outside company Outlook for full API control without Azure/IT approval issues
- **Agents:** Run as scheduled backend services on Railway — not desktop-based

---

## Future Ideas to Revisit

- Submarket breakdown view (inventory by city: Fontana, Rialto, Victorville, etc.)
- GIS/zoning layer on property map (check SoCal county GIS portals for shapefiles)
- Market conditions tab (low priority — CoStar covers this adequately for now)
- Client relationship notes field (communication style, history, pain points) separate from deal notes
