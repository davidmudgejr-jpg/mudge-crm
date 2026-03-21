#!/usr/bin/env node
/**
 * Cleanup script: Split compound comma-separated names that should've been individual records.
 * Fixes contacts, companies, and campaigns where Airtable linked fields were exported as
 * comma-separated values but imported as single records.
 *
 * Also strips role tags like "(owner)", "(tenant)", "(broker)" from names.
 *
 * Usage: node scripts/cleanup-comma-split.js [--dry-run|--live]
 */

const { Pool } = require('pg');
const { normalizeContactName, normalizeCompanyName, normalizeAddress, levenshtein } = require('../server/utils/addressNormalizer');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_LFY9Gyds7VDA@ep-withered-mode-aktp7v63-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require';
const dryRun = !process.argv.includes('--live');

const ROLE_TAG_RE = /\s*\((?:owner|tenant|broker|manager|agent)\)\s*$/i;

function stripRoleTag(s) {
  return s.replace(ROLE_TAG_RE, '').trim();
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Comma-Split Cleanup — ${dryRun ? '🟡 DRY RUN' : '🔴 LIVE'}`);
  console.log(`${'='.repeat(60)}\n`);

  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  const report = {
    contacts: { split: 0, roleTagFixed: 0, merged: 0, deleted: 0 },
    companies: { split: 0, roleTagFixed: 0, merged: 0, deleted: 0 },
    campaigns: { split: 0, roleTagFixed: 0, merged: 0, deleted: 0 },
    junctions: { moved: 0 },
    errors: [],
  };

  try {
    if (!dryRun) await client.query('BEGIN');

    // Pre-load caches for fast in-memory matching
    console.log('[cache] Loading contacts, companies, campaigns...');
    const { rows: allContacts } = await client.query(`SELECT contact_id, full_name FROM contacts`);
    const contactCache = new Map(); // normalized_name → [{contact_id, full_name}]
    for (const c of allContacts) {
      const norm = normalizeContactName(c.full_name);
      if (norm) {
        if (!contactCache.has(norm)) contactCache.set(norm, []);
        contactCache.get(norm).push(c);
      }
    }

    const { rows: allCompanies } = await client.query(`SELECT company_id, company_name FROM companies`);
    const companyCache = new Map(); // normalized_name → company_id
    for (const c of allCompanies) {
      const norm = normalizeCompanyName(c.company_name);
      if (norm) companyCache.set(norm, c.company_id);
    }

    const { rows: allCampaigns } = await client.query(`SELECT campaign_id, name FROM campaigns`);
    const campaignCache = new Map(); // lowercase name → campaign_id
    for (const c of allCampaigns) {
      if (c.name) campaignCache.set(c.name.toLowerCase().trim(), c.campaign_id);
    }
    console.log(`[cache] ${allContacts.length} contacts, ${allCompanies.length} companies, ${allCampaigns.length} campaigns`);

    // ============================================================
    // 1. FIX CONTACTS with commas or role tags
    // ============================================================
    console.log('[1/3] Fixing contacts...');
    const { rows: badContacts } = await client.query(
      `SELECT contact_id, full_name, type FROM contacts
       WHERE full_name LIKE '%,%' OR full_name ~* '\\(owner\\)|\\(tenant\\)|\\(broker\\)|\\(manager\\)'`
    );
    console.log(`  Found ${badContacts.length} contacts to fix`);

    for (const contact of badContacts) {
      try {
        if (!dryRun) await client.query(`SAVEPOINT contact_${contact.contact_id.replace(/-/g, '')}`);

        // Split on commas and strip role tags
        const names = contact.full_name
          .split(',')
          .map(s => stripRoleTag(s.trim()))
          .filter(s => s && s.toLowerCase() !== 'owner' && s.toLowerCase() !== 'tenant' && s.toLowerCase() !== 'broker');

        if (names.length === 0) {
          // Empty after stripping — delete the contact
          if (!dryRun) {
            await client.query(`DELETE FROM property_contacts WHERE contact_id = $1`, [contact.contact_id]);
            await client.query(`DELETE FROM contact_companies WHERE contact_id = $1`, [contact.contact_id]);
            await client.query(`DELETE FROM interaction_contacts WHERE contact_id = $1`, [contact.contact_id]);
            await client.query(`DELETE FROM campaign_contacts WHERE contact_id = $1`, [contact.contact_id]);
            await client.query(`DELETE FROM contacts WHERE contact_id = $1`, [contact.contact_id]);
          }
          report.contacts.deleted++;
          continue;
        }

        if (names.length === 1) {
          // Just a role tag to strip — update in place
          if (names[0] !== contact.full_name) {
            if (!dryRun) {
              await client.query(`UPDATE contacts SET full_name = $1 WHERE contact_id = $2`, [names[0], contact.contact_id]);
            }
            report.contacts.roleTagFixed++;
          }
          continue;
        }

        // Multiple names — need to split
        // Keep the first name on the original record, create new records for the rest
        const firstName = names[0];
        if (!dryRun) {
          await client.query(`UPDATE contacts SET full_name = $1 WHERE contact_id = $2`, [firstName, contact.contact_id]);
        }

        // Get all junctions from the original compound record
        const { rows: propJunctions } = await client.query(
          `SELECT property_id, role FROM property_contacts WHERE contact_id = $1`, [contact.contact_id]
        );
        const { rows: compJunctions } = await client.query(
          `SELECT company_id FROM contact_companies WHERE contact_id = $1`, [contact.contact_id]
        );
        const { rows: campJunctions } = await client.query(
          `SELECT campaign_id FROM campaign_contacts WHERE contact_id = $1`, [contact.contact_id]
        );

        // Create new contacts for names[1..n] and copy junctions
        for (let i = 1; i < names.length; i++) {
          const splitName = names[i];

          // Check if this person already exists (in-memory cache lookup)
          const norm = normalizeContactName(splitName);
          let existingId = null;
          if (norm && contactCache.has(norm)) {
            const matches = contactCache.get(norm).filter(c => c.contact_id !== contact.contact_id);
            if (matches.length > 0) {
              existingId = matches[0].contact_id;
              report.contacts.merged++;
            }
          }

          let newContactId;
          if (existingId) {
            newContactId = existingId;
          } else {
            if (!dryRun) {
              const { rows } = await client.query(
                `INSERT INTO contacts (full_name, type) VALUES ($1, $2) RETURNING contact_id`,
                [splitName, contact.type]
              );
              newContactId = rows[0].contact_id;
            }
            report.contacts.split++;
          }

          // Copy junctions to the new/existing contact
          if (!dryRun && newContactId) {
            for (const pj of propJunctions) {
              await client.query(
                `INSERT INTO property_contacts (property_id, contact_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                [pj.property_id, newContactId, pj.role]
              );
              report.junctions.moved++;
            }
            for (const cj of compJunctions) {
              await client.query(
                `INSERT INTO contact_companies (contact_id, company_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [newContactId, cj.company_id]
              );
              report.junctions.moved++;
            }
            for (const caj of campJunctions) {
              await client.query(
                `INSERT INTO campaign_contacts (campaign_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [caj.campaign_id, newContactId]
              );
              report.junctions.moved++;
            }
          }
        }

        if (!dryRun) await client.query(`RELEASE SAVEPOINT contact_${contact.contact_id.replace(/-/g, '')}`);
      } catch (err) {
        report.errors.push({ type: 'contact', id: contact.contact_id, name: contact.full_name, error: err.message });
        if (!dryRun) await client.query(`ROLLBACK TO SAVEPOINT contact_${contact.contact_id.replace(/-/g, '')}`).catch(() => {});
      }
    }

    // ============================================================
    // 2. FIX COMPANIES — ONLY strip role tags, do NOT split on commas
    // (Company names legitimately contain commas: "Amazon, Inc.", "Jones Lang LaSalle, Inc.")
    // ============================================================
    console.log('[2/3] Fixing company role tags...');
    const { rows: badCompanies } = await client.query(
      `SELECT company_id, company_name, company_type FROM companies
       WHERE company_name ~* '\\(owner\\)|\\(tenant\\)|\\(broker\\)'`
    );
    console.log(`  Found ${badCompanies.length} companies with role tags`);

    for (const company of badCompanies) {
      try {
        if (!dryRun) await client.query(`SAVEPOINT company_${company.company_id.replace(/-/g, '')}`);

        const cleaned = stripRoleTag(company.company_name);

        if (!cleaned || cleaned.toLowerCase() === 'owner' || cleaned.toLowerCase() === 'tenant') {
          if (!dryRun) {
            await client.query(`DELETE FROM property_companies WHERE company_id = $1`, [company.company_id]);
            await client.query(`DELETE FROM contact_companies WHERE company_id = $1`, [company.company_id]);
            await client.query(`DELETE FROM companies WHERE company_id = $1`, [company.company_id]);
          }
          report.companies.deleted++;
          continue;
        }

        if (cleaned !== company.company_name) {
          // Check if the cleaned name already exists — merge if so
          const norm = normalizeCompanyName(cleaned);
          const existingId = norm && companyCache.has(norm) ? companyCache.get(norm) : null;

          if (existingId && existingId !== company.company_id) {
            // Merge: move all junctions to existing, delete this one
            if (!dryRun) {
              const { rows: propJunctions } = await client.query(
                `SELECT property_id, role FROM property_companies WHERE company_id = $1`, [company.company_id]
              );
              for (const pj of propJunctions) {
                await client.query(
                  `INSERT INTO property_companies (property_id, company_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                  [pj.property_id, existingId, pj.role]
                );
              }
              const { rows: contactJunctions } = await client.query(
                `SELECT contact_id FROM contact_companies WHERE company_id = $1`, [company.company_id]
              );
              for (const cj of contactJunctions) {
                await client.query(
                  `INSERT INTO contact_companies (contact_id, company_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                  [cj.contact_id, existingId]
                );
              }
              await client.query(`DELETE FROM property_companies WHERE company_id = $1`, [company.company_id]);
              await client.query(`DELETE FROM contact_companies WHERE company_id = $1`, [company.company_id]);
              await client.query(`DELETE FROM companies WHERE company_id = $1`, [company.company_id]);
            }
            report.companies.merged++;
          } else {
            if (!dryRun) {
              await client.query(`UPDATE companies SET company_name = $1 WHERE company_id = $2`, [cleaned, company.company_id]);
            }
            report.companies.roleTagFixed++;
          }
        }

        if (!dryRun) await client.query(`RELEASE SAVEPOINT company_${company.company_id.replace(/-/g, '')}`);
      } catch (err) {
        report.errors.push({ type: 'company', id: company.company_id, name: company.company_name, error: err.message });
        if (!dryRun) await client.query(`ROLLBACK TO SAVEPOINT company_${company.company_id.replace(/-/g, '')}`).catch(() => {});
      }
    }

    // ============================================================
    // 3. FIX CAMPAIGNS with commas or role tags
    // ============================================================
    console.log('[3/3] Fixing campaigns...');
    const { rows: badCampaigns } = await client.query(
      `SELECT campaign_id, name FROM campaigns WHERE name LIKE '%,%'`
    );
    console.log(`  Found ${badCampaigns.length} campaigns to fix`);

    for (const campaign of badCampaigns) {
      try {
        if (!dryRun) await client.query(`SAVEPOINT campaign_${campaign.campaign_id.replace(/-/g, '')}`);

        const names = campaign.name.split(',').map(s => s.trim()).filter(Boolean);

        if (names.length <= 1) continue;

        // Keep first name on original record
        if (!dryRun) {
          await client.query(`UPDATE campaigns SET name = $1 WHERE campaign_id = $2`, [names[0], campaign.campaign_id]);
        }

        const { rows: contactJunctions } = await client.query(
          `SELECT contact_id FROM campaign_contacts WHERE campaign_id = $1`, [campaign.campaign_id]
        );

        for (let i = 1; i < names.length; i++) {
          const splitName = names[i];

          // In-memory cache lookup
          const normCamp = splitName.toLowerCase().trim();
          const existingCampId = campaignCache.get(normCamp);

          let newCampaignId;
          if (existingCampId && existingCampId !== campaign.campaign_id) {
            newCampaignId = existingCampId;
            report.campaigns.merged++;
          } else {
            if (!dryRun) {
              const { rows } = await client.query(
                `INSERT INTO campaigns (name, status) VALUES ($1, 'imported') RETURNING campaign_id`,
                [splitName]
              );
              newCampaignId = rows[0].campaign_id;
            }
            report.campaigns.split++;
          }

          if (!dryRun && newCampaignId) {
            for (const cj of contactJunctions) {
              await client.query(
                `INSERT INTO campaign_contacts (campaign_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [newCampaignId, cj.contact_id]
              );
              report.junctions.moved++;
            }
          }
        }

        if (!dryRun) await client.query(`RELEASE SAVEPOINT campaign_${campaign.campaign_id.replace(/-/g, '')}`);
      } catch (err) {
        report.errors.push({ type: 'campaign', id: campaign.campaign_id, name: campaign.name, error: err.message });
        if (!dryRun) await client.query(`ROLLBACK TO SAVEPOINT campaign_${campaign.campaign_id.replace(/-/g, '')}`).catch(() => {});
      }
    }

    if (!dryRun) await client.query('COMMIT');

    // Print report
    console.log(`\n${'='.repeat(60)}`);
    console.log('CLEANUP REPORT');
    console.log(`${'='.repeat(60)}`);
    console.log(`\nContacts:`);
    console.log(`  Split into individuals: ${report.contacts.split}`);
    console.log(`  Role tags stripped: ${report.contacts.roleTagFixed}`);
    console.log(`  Merged with existing: ${report.contacts.merged}`);
    console.log(`  Deleted (empty): ${report.contacts.deleted}`);
    console.log(`\nCompanies:`);
    console.log(`  Split into individuals: ${report.companies.split}`);
    console.log(`  Role tags stripped: ${report.companies.roleTagFixed}`);
    console.log(`  Merged with existing: ${report.companies.merged}`);
    console.log(`  Deleted (empty): ${report.companies.deleted}`);
    console.log(`\nCampaigns:`);
    console.log(`  Split into individuals: ${report.campaigns.split}`);
    console.log(`  Merged with existing: ${report.campaigns.merged}`);
    console.log(`\nJunctions moved/copied: ${report.junctions.moved}`);
    console.log(`\nErrors: ${report.errors.length}`);
    if (report.errors.length > 0) {
      report.errors.slice(0, 20).forEach(e => console.log(`  [${e.type}] ${e.name}: ${e.error}`));
    }

  } catch (err) {
    console.error('FATAL:', err.message);
    if (!dryRun) await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
    await pool.end();
  }
}

main();
