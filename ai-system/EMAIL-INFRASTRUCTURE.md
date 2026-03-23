# Email Sending Infrastructure
## From Approved Outreach Draft to Delivered Email and Back
### IE CRM AI Master System

---

## The Full Picture

The Matcher agent drafts outreach emails. Tier 2 reviews them. David (or Claude) approves them. Then what? This document covers everything from the moment an outreach draft gets approved to when a reply lands back in IE CRM.

```
Matcher drafts outreach → sandbox_outreach (status: pending)
        ↓
Tier 2 reviews → approved
        ↓
David confirms batch (or auto-send if trust is high enough)
        ↓
Email sending service delivers the email
        ↓
Recipient opens / clicks / replies / bounces / unsubscribes
        ↓
Webhook fires back → IE CRM records the event
        ↓
Reply triggers: create interaction record in IE CRM
Bounce triggers: verify_email priority on priority board
Unsubscribe triggers: mark contact as do-not-email
```

---

## Email Service: Postmark (Recommended)

### Why Postmark Over SendGrid / SES / Mailgun

| Criteria | Postmark | SendGrid | Amazon SES |
|----------|----------|----------|------------|
| **Deliverability** | Best in class — strict sender policies = high inbox rate | Good but declining reputation (spam abuse on platform) | Good but requires more setup |
| **Transactional focus** | Built for transactional/1:1 email, not bulk marketing | Built for bulk — features you don't need | Raw infrastructure — build everything yourself |
| **Pricing** | $15/mo for 10K emails | Free tier then $20/mo+ | $0.10 per 1K emails (cheapest at scale) |
| **Webhook support** | Excellent — delivery, bounce, open, click, reply | Good | Basic — need more setup |
| **Inbound email** | Built-in inbound processing (replies come back via webhook) | Requires SendGrid Inbound Parse | Requires SES + SNS + Lambda |
| **API simplicity** | Clean REST API, great docs | More complex, lots of legacy features | AWS complexity |
| **CAN-SPAM tools** | Built-in unsubscribe handling | Built-in | DIY |

**Recommendation: Postmark** — it's built for exactly what you're doing (1:1 transactional outreach, not bulk marketing). Best deliverability, cleanest API, built-in inbound email processing for reply tracking. The volume (probably <500 emails/month starting out) fits comfortably in their base tier.

**Alternative if cost-sensitive at scale: Amazon SES** — 10x cheaper per email but significantly more engineering to set up webhooks, inbound processing, and compliance.

---

## Sending Domain Setup

### Domain Configuration

You need a dedicated sending domain — NOT david@personalemail.com.

**Recommended setup:**
```
Sending address:  david@mudgeteamcre.com (or whatever your business domain is)
Reply-to address: david@mudgeteamcre.com (same — replies go to same address)
```

### DNS Records Required

Before Postmark can send on your behalf, you need these DNS records on your domain:

```
1. SPF Record (TXT)
   Host: @
   Value: v=spf1 include:spf.mtasv.net ~all
   Purpose: Tells email servers "Postmark is authorized to send email for this domain"

2. DKIM Record (TXT)
   Host: [provided by Postmark — usually a long selector string]
   Value: [provided by Postmark]
   Purpose: Cryptographic signature proving emails weren't tampered with

3. DMARC Record (TXT)
   Host: _dmarc
   Value: v=DMARC1; p=none; rua=mailto:dmarc-reports@mudgeteamcre.com
   Purpose: Tells receiving servers what to do with emails that fail SPF/DKIM

4. Return-Path (CNAME)
   Host: pm-bounces
   Value: pm.mtasv.net
   Purpose: Bounce handling — bounced emails go to Postmark for processing
```

**Start with `p=none` on DMARC** (monitoring mode). After 2-4 weeks of clean sending, upgrade to `p=quarantine` then `p=reject` for maximum deliverability.

### Domain Warm-Up

New sending domains start with zero reputation. Email providers (Gmail, Outlook) are suspicious of new domains sending volume immediately.

**Warm-up schedule:**
```
Week 1:  Max 10 emails/day — only to contacts you have a relationship with
Week 2:  Max 25 emails/day — expand to verified contacts
Week 3:  Max 50 emails/day — broader outreach
Week 4+: Normal volume — up to the daily limit you're comfortable with
```

**During warm-up:**
- Only send to NeverBounce-verified email addresses (no bounces)
- Personalized content only (no templates that look like marketing)
- Monitor open rates — if below 15%, slow down
- If any spam complaints: pause and investigate immediately

---

## Email Sending Flow (Technical)

### Step 1: Approval → Send Queue

When a sandbox_outreach item is approved:

```sql
-- Move from sandbox to send queue
UPDATE sandbox_outreach
SET status = 'approved', reviewed_by = 'david', reviewed_at = NOW()
WHERE id = $1;
```

Approved items enter the **outbound_email_queue** table:

```sql
CREATE TABLE IF NOT EXISTS outbound_email_queue (
  id SERIAL PRIMARY KEY,
  sandbox_outreach_id INTEGER REFERENCES sandbox_outreach(id),
  -- Email details
  to_email TEXT NOT NULL,
  to_name TEXT,
  from_email TEXT NOT NULL DEFAULT 'david@mudgeteamcre.com',
  from_name TEXT NOT NULL DEFAULT 'David Mudge',
  reply_to TEXT NOT NULL DEFAULT 'david@mudgeteamcre.com',
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,          -- plain text fallback
  -- Sending metadata
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'sending', 'sent', 'failed', 'cancelled'
  )),
  scheduled_for TIMESTAMPTZ DEFAULT NOW(), -- can schedule future sends
  sent_at TIMESTAMPTZ,
  -- Postmark response
  postmark_message_id TEXT,         -- Postmark's ID for tracking
  postmark_error TEXT,              -- error message if send failed
  -- Tracking
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  bounce_type TEXT,                 -- hard, soft, spam_complaint
  unsubscribed_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_queue_status ON outbound_email_queue(status);
CREATE INDEX idx_email_queue_scheduled ON outbound_email_queue(scheduled_for);
CREATE INDEX idx_email_queue_postmark ON outbound_email_queue(postmark_message_id);
```

### Step 2: Send Worker

A background worker (runs on the CRM backend, NOT on the Mac Mini) processes the send queue:

```
Every 60 seconds:
1. Query: SELECT * FROM outbound_email_queue WHERE status = 'queued' AND scheduled_for <= NOW() ORDER BY created_at LIMIT 10

2. For each email:
   a. Mark as 'sending'
   b. Call Postmark API:
      POST https://api.postmarkapp.com/email
      {
        "From": "David Mudge <david@mudgeteamcre.com>",
        "To": "John Smith <john@company.com>",
        "Subject": "Industrial space in Ontario — 15K SF just listed",
        "HtmlBody": "<html>...</html>",
        "TextBody": "...",
        "ReplyTo": "david@mudgeteamcre.com",
        "TrackOpens": true,
        "TrackLinks": "HtmlAndText",
        "MessageStream": "outbound"
      }
   c. On success: mark as 'sent', store postmark_message_id
   d. On failure: mark as 'failed', store error, retry up to 3 times

3. Rate limit: max 10 emails per minute (respect warm-up schedule)
```

### Step 3: Webhook Processing (Events Come Back)

Postmark sends webhooks when things happen to your emails. Set up a webhook endpoint in the CRM backend:

**Endpoint:** `POST /api/webhooks/postmark`

Events to handle:

```
DELIVERY:
  → Update outbound_email_queue: confirm sent_at
  → No action needed in CRM — just confirmation

OPEN:
  → Update outbound_email_queue: set opened_at
  → Create interaction in IE CRM:
    type: 'email_opened'
    contact_id: [looked up from to_email]
    notes: "Opened outreach email: [subject]"
  → This is a buying signal — the contact is engaged

CLICK:
  → Update outbound_email_queue: set clicked_at
  → Create interaction in IE CRM:
    type: 'email_clicked'
    notes: "Clicked link in outreach email: [subject]"
  → Stronger buying signal

BOUNCE:
  → Update outbound_email_queue: set bounced_at, bounce_type
  → If hard bounce:
    - Mark contact email as invalid in IE CRM
    - Post to priority board: verify_email for this contact
    - Log: "Hard bounce for [email] — need updated email"
  → If soft bounce:
    - Retry send once after 4 hours
    - If second soft bounce: treat as hard bounce

SPAM COMPLAINT:
  → Update outbound_email_queue: bounce_type = 'spam_complaint'
  → IMMEDIATELY mark contact as do-not-email in IE CRM
  → Log ALERT: "Spam complaint from [email]. Contact marked do-not-email."
  → If >2 complaints in a week: PAUSE all sending, escalate to David
  → This is serious — affects your domain reputation

UNSUBSCRIBE (if using Postmark's unsubscribe header):
  → Mark contact as do-not-email in IE CRM
  → Log: "Contact [name] unsubscribed"
```

---

## Reply Tracking

This is the most valuable event — someone replied to your outreach. That's a warm lead.

### Option A: Postmark Inbound Processing (Recommended)

Postmark can receive inbound emails and forward them to your webhook:

1. Configure an inbound address: `inbound@mudgeteamcre.com`
2. Set reply-to on outbound emails to this inbound address
3. Postmark receives the reply and sends it to your webhook

**BUT** — this means replies go to a webhook address, not David's actual inbox. David wouldn't see replies in his regular email client.

### Option B: BCC + IMAP Monitoring (Simpler)

1. Outbound emails are sent from `david@mudgeteamcre.com` (David's real email)
2. Reply-to is `david@mudgeteamcre.com` (David's real email)
3. Replies land in David's inbox like normal — he sees them immediately
4. A background worker monitors David's inbox via IMAP:
   - Check for new emails every 2 minutes
   - Match replies to outbound emails by subject line / In-Reply-To header
   - When match found: create interaction record in IE CRM
   - Don't move or modify the email — just record the interaction

**Recommendation: Option B for now.** David sees replies naturally in his inbox. The system tracks them in the background. Simpler, less infrastructure, and David doesn't miss anything.

### Reply → Interaction Record

When a reply is detected:
```sql
INSERT INTO interactions (
  contact_id,
  type,
  direction,
  subject,
  notes,
  occurred_at
) VALUES (
  $contact_id,
  'email',
  'inbound',
  'RE: Industrial space in Ontario — 15K SF just listed',
  'Reply detected from automated outreach. Full email in David''s inbox.',
  NOW()
);
```

Also create an action item:
```sql
INSERT INTO action_items (
  contact_id,
  title,
  description,
  priority,
  due_date
) VALUES (
  $contact_id,
  'Follow up — replied to outreach',
  'John Smith replied to outreach about 123 Industrial Way. Check inbox for full reply.',
  'high',
  NOW() + INTERVAL '1 day'
);
```

---

## CAN-SPAM Compliance

This is non-negotiable. Violations can result in fines up to $50,000+ per email.

### Requirements Built Into the System

```
1. ACCURATE FROM ADDRESS
   ✓ Emails come from david@mudgeteamcre.com (real person, real company)
   ✓ The "From" name is "David Mudge" (real name)

2. NO DECEPTIVE SUBJECT LINES
   ✓ Subject must accurately describe the email content
   ✓ Matcher agent instructions already require this
   ✓ Tier 2 validates subject lines during review

3. IDENTIFY AS ADVERTISEMENT (if applicable)
   - CRE outreach to property owners/tenants = commercial message
   - Include physical business address in email footer
   - Include "This email is a commercial message" if no prior relationship

4. UNSUBSCRIBE MECHANISM
   ✓ Every outreach email includes an unsubscribe link in the footer
   ✓ Unsubscribe must be processed within 10 business days (we do it instantly)
   ✓ Once unsubscribed, NEVER email that contact again

5. HONOR OPT-OUTS
   ✓ do_not_email flag on contacts table
   ✓ Matcher agent checks do_not_email before drafting
   ✓ Send worker double-checks before sending
   ✓ No way to override — once opted out, always opted out

6. PHYSICAL ADDRESS
   ✓ Include David's business address in email footer
```

### Email Footer Template

Every outreach email includes this footer:

```html
<div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; font-size: 11px; color: #999;">
  David Mudge | Mudge Team CRE<br>
  [Business Address Line 1]<br>
  [City, State ZIP]<br>
  <a href="{{unsubscribe_url}}">Unsubscribe</a>
</div>
```

---

## Do-Not-Email System

### Database Support

Add a `do_not_email` column to the contacts table (if not already present):

```sql
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_email BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_email_reason TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_email_at TIMESTAMPTZ;
```

### Enforcement Points (Belt AND Suspenders)

The do-not-email flag is checked at FOUR points:

```
1. MATCHER AGENT (drafting):
   Before drafting outreach, query: GET /api/ai/contacts/:id
   If do_not_email = true → skip, do not draft

2. TIER 2 REVIEW (validation):
   Before approving outreach, check contact's do_not_email status
   If true → auto-reject with note "Contact is do-not-email"

3. SEND QUEUE (final check before sending):
   Before calling Postmark API, re-check do_not_email
   If true → cancel the send, mark as 'cancelled'

4. POSTMARK (platform-level):
   Postmark maintains its own suppression list for bounces and complaints
   Even if we mess up, Postmark won't deliver to suppressed addresses
```

---

## Sending Limits & Pacing

### Daily Limits

| Phase | Max Emails/Day | Why |
|-------|---------------|-----|
| Warm-up Week 1 | 10 | Building domain reputation |
| Warm-up Week 2 | 25 | Gradual increase |
| Warm-up Week 3 | 50 | Still building trust |
| Steady state | 100 | Sustainable for 1:1 outreach |
| High volume (future) | 200-500 | Only after months of clean sending |

### Sending Windows

Don't send emails at 3 AM — it looks automated (because it is).

```
Sending window:  8:00 AM - 6:00 PM Pacific, Monday-Friday
Optimal times:   9:00-11:00 AM and 1:00-3:00 PM (highest open rates for B2B)
Never send:      Weekends, holidays, before 7 AM, after 8 PM
```

The send worker respects these windows. Emails approved outside the window are queued for the next available slot.

### Spacing

Don't send 50 emails in 1 minute — space them out:

```
Minimum gap between sends: 30 seconds
Random jitter: add 0-30 seconds of random delay
Result: emails go out every 30-60 seconds, looking natural
```

---

## Metrics to Track

### Dashboard: "Outreach Performance" Panel

```
Today:
  Sent: 12 | Opened: 7 (58%) | Clicked: 2 (17%) | Replied: 1 (8%)
  Bounced: 0 | Complaints: 0

This Week:
  Sent: 45 | Opened: 28 (62%) | Clicked: 8 (18%) | Replied: 4 (9%)
  Bounced: 1 | Complaints: 0

Domain Health:
  Reputation: Good ✓
  SPF: Pass ✓ | DKIM: Pass ✓ | DMARC: Pass ✓

Unsubscribed this month: 2
Do-not-email total: 7
```

### Alert Thresholds

```
Open rate < 15%          → Warning: emails may be going to spam
Bounce rate > 5%         → Warning: email list quality issue
Spam complaints > 0.1%   → ALERT: pause sending immediately
Reply rate > 10%         → Nice: system is working well
```

---

## Add to Migration 007

The `outbound_email_queue` table and `do_not_email` column should be included in the infrastructure build.

---

*Created: March 2026*
*For: IE CRM AI Master System — Email Sending Infrastructure*
