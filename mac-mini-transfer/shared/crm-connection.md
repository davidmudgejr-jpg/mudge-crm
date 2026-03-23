# CRM API Connection Details
## For All AI Agents

### Base URL
```
https://mudge-crm-production.up.railway.app
```

### Authentication
Include this header on every request:
```
X-Agent-Key: [PASTE YOUR AGENT_API_KEY HERE]
```
Set this key in Railway env vars as `AGENT_API_KEY`. Use the same key here.

---

## Read Endpoints (All Agents)

### Database Overview
```
GET /api/ai/stats
```
Returns: entity counts, active deals, sandbox queue counts, recent activity

### Search Properties
```
GET /api/ai/properties?search=cajalco&city=Perris&type=Industrial&min_sf=10000&max_sf=50000&limit=20
```
All params optional. Search matches on street_address.

### Search Contacts
```
GET /api/ai/contacts?search=Mike&city=Ontario&type=Owner&limit=20
```
All params optional. Search matches on full_name, first_name, last_name.

### Search Companies
```
GET /api/ai/companies?search=Pacific&city=Corona&type=Tenant&limit=20
```

### Search Comps
```
GET /api/ai/comps?city=Ontario&type=lease&min_sf=5000&max_sf=25000&limit=20
```
type is "lease" or "sale"

### Active Deals
```
GET /api/ai/deals?status=Active&deal_type=Lease&limit=20
```

---

## Sandbox Write Endpoints (Tier 3 Agents)

### Submit New Contact
```
POST /api/ai/sandbox/contact
{
  "full_name": "John Smith",
  "email": "john@example.com",
  "phone": "909-555-1234",
  "company_name": "Pacific West Holdings",
  "title": "Owner",
  "type": "Owner",
  "city": "Ontario",
  "state": "CA",
  "sources": ["Open Corporates", "White Pages"],
  "source_urls": ["https://opencorporates.com/..."],
  "confidence_score": 85,
  "agent_name": "enricher",
  "notes": "Found via LLC registration, cross-referenced with White Pages"
}
```

### Submit Enrichment
```
POST /api/ai/sandbox/enrichment
{
  "contact_id": "uuid-here",
  "field_name": "email",
  "old_value": null,
  "new_value": "john@pacificwest.com",
  "source": "BeenVerified",
  "source_url": "https://...",
  "confidence_score": 80,
  "agent_name": "enricher"
}
```

### Submit Market Signal
```
POST /api/ai/sandbox/signal
{
  "headline": "Pacific West Holdings expanding to 3rd warehouse",
  "description": "Company announced 50K SF lease in Fontana industrial park",
  "signal_type": "expansion",
  "source_url": "https://news-article-url",
  "confidence_score": 75,
  "crm_match": true,
  "crm_entity_type": "company",
  "crm_entity_id": "uuid-here",
  "agent_name": "researcher"
}
```

### Submit Draft Outreach
```
POST /api/ai/sandbox/outreach
{
  "contact_id": "uuid-here",
  "email": "john@pacificwest.com",
  "subject": "New 25K SF listing in Ontario — thought of you",
  "body": "Hi John, a new industrial space just hit the market on Haven Ave...",
  "match_reason": "Contact owns similar-sized building 1.2 miles away",
  "property_id": "uuid-here",
  "confidence_score": 80,
  "agent_name": "matcher",
  "dedup_key": "john-smith-haven-ave-2026-03"
}
```

---

## Operations Endpoints

### Report Agent Status (Every Cycle)
```
POST /api/ai/agent/heartbeat
{
  "agent_name": "chief_of_staff",
  "tier": 1,
  "status": "running",
  "current_task": "Morning database analysis",
  "items_processed_today": 0,
  "items_in_queue": 0,
  "metadata": {}
}
```

### Write Log Entry
```
POST /api/ai/agent/log
{
  "agent_name": "chief_of_staff",
  "log_type": "analysis",
  "message": "Identified 3 properties with lease expirations in Q3",
  "details": { "property_ids": ["uuid1", "uuid2", "uuid3"] },
  "level": "info"
}
```

### Get Pending Sandbox Items (Ralph uses this)
```
GET /api/ai/queue/pending
```
Returns all pending items across all sandbox tables.

### Approve Sandbox Item
```
POST /api/ai/queue/approve/contacts/123
POST /api/ai/queue/approve/enrichments/456
POST /api/ai/queue/approve/signals/789
POST /api/ai/queue/approve/outreach/101
```

### Reject Sandbox Item
```
POST /api/ai/queue/reject/contacts/123
{
  "reason": "Only one data source",
  "feedback": "Cross-reference with White Pages before scoring above 50"
}
```

---

## Houston CEO Chat Posting

### Post to Team Chat
```
POST /api/ai/chat/post
{
  "message": "Good morning team! Here's your daily briefing...",
  "sender_name": "Houston"
}
```
Posts as Houston to the Team Chat. If channel_id not provided, posts to the General channel.

---

## Database Stats (For Reference)
- ~10,000 properties (Inland Empire industrial focus)
- ~9,000 contacts
- ~19,000 companies
- ~4,000 comps (lease + sale)
- Key cities: Ontario, Fontana, Rancho Cucamonga, Riverside, San Bernardino, Corona, Eastvale, Chino, Pomona, Perris, Moreno Valley
- Focus: Industrial real estate (warehouses, distribution, manufacturing, flex)
