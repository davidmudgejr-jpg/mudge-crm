# IE CRM

A native Mac desktop CRM application built for commercial real estate in the Inland Empire. Features an AI assistant powered by Claude that can read and write directly to your database using natural language.

## Tech Stack

- **Desktop**: Electron (native Mac app)
- **Frontend**: React 18 + Tailwind CSS + Vite
- **Database**: PostgreSQL (hosted on Railway)
- **AI**: Anthropic Claude API (claude-sonnet-4-5)
- **Data Sync**: Airtable REST API

## Features

- **Properties, Contacts, Companies, Deals, Activity, Campaigns** — full CRUD with linked records
- **Claude AI Panel** — natural language queries and commands that execute SQL directly
- **Auto-execute with Undo** — write operations run on a 1.5s countdown with one-click undo
- **Formula Columns** — Claude can create computed columns that recalculate live
- **Airtable Sync** — one-click import from Airtable with upsert on `airtable_id`
- **Dark UI** — purpose-built dark theme optimized for real estate workflows

## Prerequisites

- **Node.js** 18+ and npm
- **PostgreSQL** database (Railway recommended)
- **Anthropic API key** for Claude AI features
- **Airtable API key** (optional, for data sync)

## Setup

### 1. Clone and install

```bash
cd ie-crm
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

- `DATABASE_URL` — PostgreSQL connection string from Railway
- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com/)
- `AIRTABLE_API_KEY` — from [airtable.com/create/tokens](https://airtable.com/create/tokens)
- `AIRTABLE_BASE_ID` — from your Airtable base URL

### 3. Initialize the database

Run the schema against your PostgreSQL database:

```bash
psql $DATABASE_URL < schema.sql
```

Or paste the contents of `schema.sql` into Railway's Query tab.

### 4. Run in development

```bash
npm run dev
```

This starts Vite dev server and launches Electron pointing at `localhost:5173`.

### 5. Build for production

```bash
npm run build
npm run electron
```

## Project Structure

```
ie-crm/
├── electron/
│   ├── main.js          # Electron main process + IPC handlers
│   └── preload.js       # Secure context bridge
├── src/
│   ├── api/
│   │   ├── database.js  # PostgreSQL query layer
│   │   ├── claude.js    # Claude API integration
│   │   └── airtable.js  # Airtable sync module
│   ├── components/
│   │   ├── Sidebar.jsx  # Navigation sidebar
│   │   └── ClaudePanel.jsx  # AI assistant panel
│   ├── hooks/
│   │   └── useFormulaColumns.js
│   ├── pages/
│   │   ├── Properties.jsx
│   │   ├── PropertyDetail.jsx
│   │   ├── Contacts.jsx
│   │   ├── Companies.jsx
│   │   ├── Deals.jsx
│   │   ├── Interactions.jsx
│   │   ├── Campaigns.jsx
│   │   └── Settings.jsx
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── schema.sql           # Full PostgreSQL schema
├── .env.example         # Environment template
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Database Schema

Six main tables with junction tables for linked records:

- **properties** — address, type, sqft, owner, priority, tags
- **contacts** — name, email, phone, company, role, tags
- **companies** — name, type, industry, employees, revenue
- **deals** — name, stage, value, probability, dates
- **interactions** — type, subject, notes, date, direction
- **campaigns** — name, type, status, sent date, notes

Plus: `formula_columns` for Claude-created computed columns, `undo_log` for write reversal, and `app_settings` for configuration.

## Claude AI Commands

Open the Claude panel and type natural language commands:

- "Show me all hot priority properties in Riverside"
- "How many deals are in the negotiation stage?"
- "Mark all properties on Main St as contacted"
- "Create a formula column that calculates price per sqft"
- "Add a new contact: John Smith, john@example.com, broker"
- "What's the total value of all open deals?"

Claude sees your full database schema and generates SQL that auto-executes with undo support.

## Airtable Sync

1. Go to **Settings** in the sidebar
2. Ensure your Airtable API key and Base ID are configured
3. Click **Sync** next to any table, or **Sync All Tables**
4. Records are upserted based on `airtable_id` — existing records update, new ones insert

## License

Private — Internal use only.
