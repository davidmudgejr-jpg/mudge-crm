# Local AI Infrastructure Plan for Brokerage Intelligence System

## Overview

This document summarizes the architecture, hardware considerations, and
workflow strategy discussed for building a hybrid AI system combining
local models with frontier cloud models (Claude / ChatGPT).

Goal: build a **broker intelligence engine** that continuously processes
data, prioritizes opportunities, and assists with outreach and deal
strategy.

------------------------------------------------------------------------

# Core Architecture

    Local Worker Node (Mac Studio / Mac mini)
            ↓
    CRM Backend / API Layer
            ↓
    Frontier Models (Claude / GPT)

## Roles

### Local Worker Node

Runs continuously and performs high‑volume tasks:

-   OpenClaw orchestration
-   local LLM inference
-   embeddings
-   document parsing
-   classification
-   nightly scoring pipelines
-   queue generation
-   semantic search indexing

### CRM Backend

Your **central database and control layer**.

The local AI **never directly touches the database tables**.\
Instead it interacts through API endpoints.

Example endpoints:

    GET /properties
    GET /owners
    GET /leases
    GET /notes

    GET /ai/property-brief
    GET /ai/top-call-targets

    POST /notes
    POST /ai-score
    POST /tasks

### Frontier Intelligence Layer

Cloud models handle tasks requiring deeper reasoning:

-   outreach writing
-   strategic analysis
-   negotiation prep
-   lease interpretation
-   BOV narrative
-   prioritizing outreach lists

------------------------------------------------------------------------

# Hardware Planning

## Recommended Machine

Mac Studio (M4 Max)

Recommended configuration:

-   **128 GB unified memory**
-   **2 TB SSD**
-   M4 Max chip

This configuration balances:

-   large model capability
-   concurrency
-   long‑term scalability
-   strong inference speed

### Why 128 GB

  RAM          Capability
  ------------ ----------------------------
  64 GB        \~70B model tight
  96 GB        70B comfortable
  **128 GB**   70B + concurrent workloads
  256 GB       massive experimentation

128 GB is considered the **practical sweet spot**.

------------------------------------------------------------------------

# Local Model Stack

Rather than one giant model, run several specialized ones.

## 1. General Reasoning Model

Used for:

-   classification
-   summarization
-   restructuring text
-   routing decisions

## 2. Embedding Model

Used for:

-   semantic search
-   property memory
-   lease clause retrieval
-   owner similarity

## 3. Document Extraction Model

Used for parsing:

-   leases
-   rent rolls
-   offering memorandums
-   title docs
-   loan documents

Output becomes structured CRM fields.

## 4. Lightweight Fast Model

Used for high‑volume tasks:

-   call note cleanup
-   triage
-   queue tagging
-   quick summaries

------------------------------------------------------------------------

# Task Routing Logic

All AI requests should pass through a router:

    Is task deterministic?
    → Use code

    Is task classification or extraction?
    → Use local model

    Is task simple summarization?
    → Use local model

    Is task complex reasoning?
    → Send to Claude / GPT

This significantly reduces API costs.

------------------------------------------------------------------------

# Nightly Automation Pipelines

Every night the worker node should run pipelines like:

1.  Update embeddings for new documents
2.  Recalculate property readiness scores
3.  Detect trigger events (loan maturity, lease expiration)
4.  Build outreach queues
5.  Summarize new notes
6.  Scan for anomalies or data conflicts
7.  Refresh market data indicators

------------------------------------------------------------------------

# Data Scoring Concept

Your **Universal Readiness Score** might include signals such as:

-   hold period length
-   loan maturity proximity
-   lease expiration timing
-   clear height obsolescence
-   absentee ownership
-   trust / estate ownership
-   zoning upside
-   truck parking conversion potential
-   recent nearby sales comps

This system helps prioritize **who to call first**.

------------------------------------------------------------------------

# Security Architecture

## Dedicated AI Worker Identity

Create separate credentials for the AI node:

-   separate Apple ID
-   separate Google account
-   separate SSH keys

## CRM Access

AI accesses the CRM through a **service token**:

Example:

    Authorization: Bearer AI_WORKER_KEY

Permissions should allow:

  Permission        Allowed
  ----------------- ---------
  Read properties   Yes
  Read notes        Yes
  Write notes       Yes
  Update scores     Yes
  Create tasks      Yes
  Delete records    No

## Network Restrictions

Allow connections only to:

-   your CRM server
-   model providers
-   approved enrichment APIs

Block everything else.

## Logging

Every AI action should be logged:

    timestamp
    action
    record_id
    before
    after
    confidence
    model_used

------------------------------------------------------------------------

# Example Daily Workflow

### Night (2 AM)

Local worker node runs:

-   scoring refresh
-   vector index updates
-   anomaly detection
-   trigger detection
-   prospect queue generation

### Morning (7 AM)

CRM dashboard shows:

-   top call targets
-   new trigger events
-   upcoming lease expirations
-   owners not contacted recently

### During Workday

When a property is opened:

1.  CRM calls local worker for a property brief
2.  local system retrieves relevant history
3.  Claude produces strategic analysis and outreach guidance

------------------------------------------------------------------------

# Long‑Term Vision

The goal is a **living intelligence database** that learns from:

-   every call
-   every email
-   every deal
-   every lease
-   every owner interaction

Over time it becomes better at predicting:

-   who will sell
-   when they will sell
-   why they will sell
-   how to approach them

This transforms a traditional brokerage database into a **predictive
deal engine**.

------------------------------------------------------------------------

# Summary

The system combines:

Local AI → infrastructure and processing\
Cloud AI → high‑level reasoning

This hybrid model provides:

-   lower API costs
-   faster automation
-   scalable intelligence
-   a growing competitive advantage in brokerage.
