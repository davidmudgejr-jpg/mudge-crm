#!/usr/bin/env node
/**
 * match-deals-to-properties.js
 *
 * Parses addresses from deal_name free text and matches them against
 * properties.normalized_address to auto-populate the deal_properties junction table.
 *
 * Usage:
 *   node scripts/match-deals-to-properties.js           # dry-run (review only)
 *   node scripts/match-deals-to-properties.js --apply    # commit matches to DB
 */

require('dotenv').config({ override: true });
const { Pool } = require('pg');
const { normalizeAddress, similarity } = require('../server/utils/addressNormalizer');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const APPLY = process.argv.includes('--apply');

// Street type patterns for address extraction
const STREET_TYPES = [
  'st', 'street', 'ave', 'avenue', 'blvd', 'boulevard', 'dr', 'drive',
  'rd', 'road', 'ln', 'lane', 'ct', 'court', 'pl', 'place', 'way',
  'pkwy', 'parkway', 'cir', 'circle', 'trl', 'trail', 'hwy', 'highway',
  'fwy', 'freeway', 'ter', 'terrace', 'crossing',
].join('|');

// Regex: street number + street name + street type (case-insensitive)
const ADDRESS_RE = new RegExp(
  `\\b(\\d{1,6}\\s+(?:[A-Za-z]+\\.?\\s+){0,4}(?:${STREET_TYPES})\\.?)\\b`,
  'gi'
);

/**
 * Extract all candidate addresses from a deal name string.
 * Returns an array of { raw, normalized } objects.
 */
function extractAddresses(dealName) {
  if (!dealName) return [];

  // Clean up common prefixes
  let text = dealName
    .replace(/^LISTING:\s*/i, '')
    .replace(/^FOR (?:SALE|LEASE):\s*/i, '')
    .replace(/\(Imported\)/gi, '')
    .trim();

  const candidates = new Set();

  // Primary extraction: full address patterns with street type
  let match;
  ADDRESS_RE.lastIndex = 0;
  while ((match = ADDRESS_RE.exec(text)) !== null) {
    const raw = match[1].trim();
    // Skip false positives like "10K SF", "2 million", "50 trucks"
    if (/^\d+\s*[kKmM]\b/.test(raw)) continue;
    if (/^\d+\s+(?:ac|sf|units?|trucks?|year|million)\b/i.test(raw)) continue;
    candidates.add(raw);
  }

  // Also try the start of the deal name for "23447 Cajalco Rd" style
  const startsWithAddr = text.match(/^(\d{3,6}\s+[A-Za-z].*?)(?:\s*[-–;(]|$)/);
  if (startsWithAddr) {
    const raw = startsWithAddr[1].trim();
    if (new RegExp(`\\b(?:${STREET_TYPES})\\b`, 'i').test(raw)) {
      candidates.add(raw);
    }
  }

  // Deduplicate and normalize
  const results = [];
  for (const raw of candidates) {
    const normalized = normalizeAddress(raw);
    if (normalized && normalized.length >= 5) {
      results.push({ raw, normalized });
    }
  }

  return results;
}

async function run() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Deal -> Property Auto-Matcher`);
  console.log(`  Mode: ${APPLY ? 'APPLY (will write to DB)' : 'DRY RUN (review only)'}`);
  console.log(`${'='.repeat(70)}\n`);

  // Load all deals
  const { rows: deals } = await pool.query(
    'SELECT deal_id, deal_name FROM deals ORDER BY deal_name'
  );

  // Load all properties with normalized addresses
  const { rows: properties } = await pool.query(
    `SELECT property_id, property_address, normalized_address, city
     FROM properties
     WHERE normalized_address IS NOT NULL AND normalized_address != ''`
  );

  // Build lookup maps
  const propByNorm = new Map();
  const propByStreetNum = new Map();
  for (const p of properties) {
    propByNorm.set(p.normalized_address, p);
    const numMatch = p.normalized_address.match(/^(\d+)/);
    if (numMatch) {
      const key = numMatch[1];
      if (!propByStreetNum.has(key)) propByStreetNum.set(key, []);
      propByStreetNum.get(key).push(p);
    }
  }

  // Check existing links
  const { rows: existingLinks } = await pool.query('SELECT deal_id, property_id FROM deal_properties');
  const existingSet = new Set(existingLinks.map(l => `${l.deal_id}:${l.property_id}`));

  const matches = [];
  const noAddress = [];
  const noMatch = [];

  for (const deal of deals) {
    const candidates = extractAddresses(deal.deal_name);

    if (candidates.length === 0) {
      noAddress.push(deal);
      continue;
    }

    let bestMatch = null;

    for (const { raw, normalized } of candidates) {
      // Method 1: Exact normalized match
      if (propByNorm.has(normalized)) {
        const p = propByNorm.get(normalized);
        if (!bestMatch || 100 > bestMatch.score) {
          bestMatch = { deal, property: p, score: 100, method: 'exact', extracted: raw };
        }
        continue;
      }

      // Method 2: Substring containment (same street number)
      const numMatch = normalized.match(/^(\d+)/);
      if (numMatch) {
        const sameNum = propByStreetNum.get(numMatch[1]) || [];
        for (const p of sameNum) {
          if (p.normalized_address.includes(normalized) || normalized.includes(p.normalized_address)) {
            const score = 85;
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { deal, property: p, score, method: 'substring', extracted: raw };
            }
          }

          // Method 3: Fuzzy match (high similarity)
          const sim = similarity(normalized, p.normalized_address);
          if (sim >= 0.75) {
            const score = Math.round(sim * 80);
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { deal, property: p, score, method: `fuzzy(${(sim * 100).toFixed(0)}%)`, extracted: raw };
            }
          }
        }
      }
    }

    if (bestMatch) {
      const key = `${bestMatch.deal.deal_id}:${bestMatch.property.property_id}`;
      if (existingSet.has(key)) {
        bestMatch.method += ' (already linked)';
        bestMatch.skip = true;
      }
      matches.push(bestMatch);
    } else {
      noMatch.push({ deal, candidates });
    }
  }

  // --- Output Report ---
  const exact = matches.filter(m => m.score >= 90);
  const high = matches.filter(m => m.score >= 70 && m.score < 90);
  const low = matches.filter(m => m.score < 70);

  console.log(`\nEXACT MATCHES (score >= 90) --- ${exact.length} deals`);
  console.log(`${'─'.repeat(70)}`);
  for (const m of exact) {
    console.log(`  [${m.score}] ${m.deal.deal_name.substring(0, 55)}`);
    console.log(`     -> ${m.property.property_address}, ${m.property.city} (${m.method})${m.skip ? ' SKIP' : ''}`);
  }

  console.log(`\nHIGH CONFIDENCE (70-89) --- ${high.length} deals`);
  console.log(`${'─'.repeat(70)}`);
  for (const m of high) {
    console.log(`  [${m.score}] ${m.deal.deal_name.substring(0, 55)}`);
    console.log(`     -> ${m.property.property_address}, ${m.property.city} (${m.method})${m.skip ? ' SKIP' : ''}`);
  }

  if (low.length > 0) {
    console.log(`\nLOW CONFIDENCE (<70) --- ${low.length} deals (NOT auto-linked)`);
    console.log(`${'─'.repeat(70)}`);
    for (const m of low) {
      console.log(`  [${m.score}] ${m.deal.deal_name.substring(0, 55)}`);
      console.log(`     -> ${m.property.property_address}, ${m.property.city} (${m.method})`);
    }
  }

  console.log(`\nADDRESS FOUND BUT NO MATCH --- ${noMatch.length} deals`);
  console.log(`${'─'.repeat(70)}`);
  for (const { deal, candidates } of noMatch.slice(0, 20)) {
    console.log(`  ${deal.deal_name.substring(0, 55)}`);
    console.log(`     extracted: ${candidates.map(c => c.normalized).join(', ')}`);
  }
  if (noMatch.length > 20) console.log(`  ... and ${noMatch.length - 20} more`);

  console.log(`\nNO ADDRESS EXTRACTED --- ${noAddress.length} deals`);
  console.log(`${'─'.repeat(70)}`);
  for (const d of noAddress.slice(0, 10)) {
    console.log(`  ${d.deal_name.substring(0, 70)}`);
  }
  if (noAddress.length > 10) console.log(`  ... and ${noAddress.length - 10} more`);

  // --- Summary ---
  const toLink = matches.filter(m => m.score >= 70 && !m.skip);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  SUMMARY`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  Total deals:          ${deals.length}`);
  console.log(`  Address extracted:     ${matches.length + noMatch.length}`);
  console.log(`  Matched (score >= 70): ${exact.length + high.length}`);
  console.log(`  Low confidence (<70): ${low.length}`);
  console.log(`  No match found:       ${noMatch.length}`);
  console.log(`  No address in name:   ${noAddress.length}`);
  console.log(`  Already linked:       ${matches.filter(m => m.skip).length}`);
  console.log(`  TO LINK:              ${toLink.length}`);
  console.log(`${'='.repeat(70)}\n`);

  // --- Apply ---
  if (APPLY && toLink.length > 0) {
    console.log(`Applying ${toLink.length} links to deal_properties...\n`);
    let inserted = 0;
    for (const m of toLink) {
      try {
        await pool.query(
          `INSERT INTO deal_properties (deal_id, property_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [m.deal.deal_id, m.property.property_id]
        );
        inserted++;
      } catch (err) {
        console.error(`  Failed: ${m.deal.deal_name} -> ${err.message}`);
      }
    }
    console.log(`\nInserted ${inserted} deal-property links.`);
  } else if (APPLY) {
    console.log('No new links to apply.');
  } else {
    console.log('Run with --apply to commit these links to the database.\n');
  }

  await pool.end();
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
