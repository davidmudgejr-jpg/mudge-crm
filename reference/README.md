# Reference Projects

Saved files from open-source projects that inspire future IE CRM features. These are NOT our code — they're reference implementations to study when building our versions.

## MiroFish (Swarm Intelligence Prediction Engine)
**GitHub:** https://github.com/666ghj/MiroFish
**What we'll use it for:** Phase 4 Deal Prediction Simulator (128GB Mac Studio)
**Key concept:** Feed CRM data into multi-agent simulation to predict deal outcomes, campaign effectiveness, and market shifts.
**Files to study:** Agent persona generation, simulation loop, report synthesis

## BettaFish (Multi-Agent Data Analysis + Forum Debate)
**GitHub:** https://github.com/666ghj/BettaFish
**What we'll use it for:**
- Phase 2: Ralph Forum Debate (GPT vs Gemini structured debate on disagreements)
- Phase 3: Email Sentiment Analysis (analyze reply tone: warm/neutral/cold/hostile)
**Key concept:** Agents debate each other via a moderated "Forum" to produce better collective decisions. Sentiment models classify text tone.
**Files to study:** ForumEngine (monitor.py, llm_host.py), SentimentAnalysisModel/

## How to use these
When it's time to build a feature inspired by these projects:
1. Read the reference files in this folder
2. Understand the architecture and patterns
3. Build our own version tailored to CRE/IE CRM — don't copy, adapt
