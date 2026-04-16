/**
 * Instantly.ai API v2 Service
 * Handles all communication with Instantly.ai for email campaigns.
 * Used by Campaign Manager agent endpoints in ai.js.
 *
 * Docs: https://developer.instantly.ai/
 * API index: https://developer.instantly.ai/llms.txt
 * Auth: Bearer token (API key with scopes)
 * Base URL: https://api.instantly.ai/api/v2
 */

const BASE_URL = 'https://api.instantly.ai/api/v2';

// Transient failures we'll retry with exponential backoff + Retry-After. We
// treat 408, 429, 500, 502, 503, 504 as retryable — everything else either
// succeeds or is a permanent failure (400, 401, 403, 404, etc.) that we
// surface to the caller immediately. QA audit 2026-04-15 P2-12.
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

function getApiKey() {
  return process.env.INSTANTLY_API_KEY || null;
}

// isConfigured(): cheap boot-time check so route handlers can 503 gracefully
// instead of crashing with an unhandled throw from inside getApiKey().
// QA audit 2026-04-15 P2-13.
function isConfigured() {
  return !!getApiKey();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Custom error class so callers can distinguish transient vs. permanent
 * failures and also read the HTTP status / response body without having
 * to parse the plain Error.message.
 */
class InstantlyApiError extends Error {
  constructor(message, { status, method, path, body } = {}) {
    super(message);
    this.name = 'InstantlyApiError';
    this.status = status;
    this.method = method;
    this.path = path;
    this.body = body; // first ~500 chars of the raw response body
  }
}

async function instantlyFetch(path, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    // Surface a clean 503-worthy error — routes should translate this into
    // res.status(503).json(...) instead of crashing with an unhandled throw.
    throw new InstantlyApiError('Instantly not configured (INSTANTLY_API_KEY missing)', {
      status: 503,
      method: options.method || 'GET',
      path,
    });
  }

  const { method = 'GET', body, params, maxRetries = DEFAULT_MAX_RETRIES } = options;

  let url = `${BASE_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }

  const fetchOptions = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  let attempt = 0;
  let lastError = null;
  // Retry loop: `maxRetries + 1` total attempts (1 initial + N retries).
  while (attempt <= maxRetries) {
    let res;
    try {
      res = await fetch(url, fetchOptions);
    } catch (networkErr) {
      // Network-layer failure (DNS, ECONNRESET, timeout before response)
      lastError = new InstantlyApiError(
        `Instantly API ${method} ${path} network error: ${networkErr.message}`,
        { status: 0, method, path }
      );
      if (attempt >= maxRetries) throw lastError;
      const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(`[instantly] network error on ${method} ${path} (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoff}ms`);
      await sleep(backoff);
      attempt++;
      continue;
    }

    if (res.ok) {
      if (res.status === 204) return null;
      return res.json();
    }

    // Non-ok: decide whether to retry or surface to caller
    const errorText = await res.text().catch(() => 'Unknown error');
    const truncated = errorText.slice(0, 500);
    lastError = new InstantlyApiError(
      `Instantly API ${method} ${path} returned ${res.status}: ${truncated}`,
      { status: res.status, method, path, body: truncated }
    );

    if (!RETRYABLE_STATUSES.has(res.status) || attempt >= maxRetries) {
      throw lastError;
    }

    // Honor Retry-After if present (seconds OR HTTP-date, we only support seconds)
    const retryAfterHeader = res.headers.get('retry-after');
    const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
    const backoff = Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? retryAfterSec * 1000
      : BASE_BACKOFF_MS * Math.pow(2, attempt);

    console.warn(`[instantly] ${res.status} on ${method} ${path} (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoff}ms`);
    await sleep(backoff);
    attempt++;
  }

  // Unreachable in practice, but satisfies the type checker
  throw lastError || new InstantlyApiError('Instantly API: exhausted retries', { method, path });
}

// ============================================================
// CAMPAIGNS
// ============================================================

/**
 * List all campaigns
 */
async function listCampaigns(params = {}) {
  return instantlyFetch('/campaigns', { params: { limit: 50, ...params } });
}

/**
 * Get a single campaign by ID
 */
async function getCampaign(campaignId) {
  return instantlyFetch(`/campaigns/${campaignId}`);
}

/**
 * Create a new campaign
 * @param {Object} data - { name, email_list, ... }
 */
async function createCampaign(data) {
  return instantlyFetch('/campaigns', { method: 'POST', body: data });
}

/**
 * Update a campaign
 */
async function updateCampaign(campaignId, data) {
  return instantlyFetch(`/campaigns/${campaignId}`, { method: 'PATCH', body: data });
}

/**
 * Activate/resume a campaign
 */
async function activateCampaign(campaignId) {
  return instantlyFetch(`/campaigns/${campaignId}/activate`, { method: 'POST' });
}

/**
 * Pause/stop a campaign
 */
async function stopCampaign(campaignId) {
  return instantlyFetch(`/campaigns/${campaignId}/stop`, { method: 'POST' });
}

/**
 * Get campaign analytics (opens, clicks, replies, bounces)
 */
async function getCampaignAnalytics(campaignId) {
  return instantlyFetch(`/campaigns/${campaignId}/analytics`);
}

/**
 * Get analytics overview across all campaigns
 */
async function getAnalyticsOverview(params = {}) {
  return instantlyFetch('/campaigns/analytics/overview', { params });
}

/**
 * Get daily analytics for a campaign
 */
async function getDailyAnalytics(campaignId, params = {}) {
  return instantlyFetch(`/campaigns/${campaignId}/daily-analytics`, { params });
}

/**
 * Get step-level analytics (which email in the sequence performs best)
 */
async function getStepsAnalytics(campaignId) {
  return instantlyFetch(`/campaigns/${campaignId}/steps-analytics`);
}

// ============================================================
// LEADS
// ============================================================

/**
 * Add leads to a campaign or list (up to 1000 at a time)
 * @param {Object} data - { leads: [{ email, first_name, last_name, ... }], campaign_id or list_id }
 */
async function bulkAddLeads(data) {
  return instantlyFetch('/leads/bulk-add', { method: 'POST', body: data });
}

/**
 * Get a single lead by ID
 */
async function getLead(leadId) {
  return instantlyFetch(`/leads/${leadId}`);
}

/**
 * Update a lead
 */
async function updateLead(leadId, data) {
  return instantlyFetch(`/leads/${leadId}`, { method: 'PATCH', body: data });
}

/**
 * Update lead interest status (interested, not_interested, neutral, etc.)
 */
async function updateLeadInterest(leadId, status) {
  return instantlyFetch(`/leads/${leadId}/interest-status`, {
    method: 'PATCH',
    body: { interest_status: status },
  });
}

/**
 * Move leads between campaigns/lists
 */
async function moveLeads(data) {
  return instantlyFetch('/leads/move', { method: 'POST', body: data });
}

/**
 * Search campaigns by lead email
 */
async function searchByEmail(email) {
  return instantlyFetch('/campaigns/search-by-email', { method: 'POST', body: { email } });
}

// ============================================================
// EMAIL ACCOUNTS
// ============================================================

/**
 * List all email accounts (the 12 sender addresses)
 */
async function listAccounts(params = {}) {
  return instantlyFetch('/accounts', { params: { limit: 50, ...params } });
}

/**
 * Get account details
 */
async function getAccount(accountId) {
  return instantlyFetch(`/accounts/${accountId}`);
}

/**
 * Test account vitals (deliverability check)
 */
async function testAccountVitals(accountId) {
  return instantlyFetch(`/accounts/${accountId}/test-vitals`);
}

/**
 * Get daily analytics for an email account
 */
async function getAccountDailyAnalytics(params = {}) {
  return instantlyFetch('/accounts/daily-analytics', { params });
}

// ============================================================
// WEBHOOKS (for real-time event notifications)
// ============================================================

/**
 * Create a webhook to receive events (opens, replies, bounces, etc.)
 * @param {Object} data - { event_type, webhook_url }
 */
async function createWebhook(data) {
  return instantlyFetch('/webhooks', { method: 'POST', body: data });
}

/**
 * List all webhooks
 */
async function listWebhooks() {
  return instantlyFetch('/webhooks');
}

/**
 * Delete a webhook
 */
async function deleteWebhook(webhookId) {
  return instantlyFetch(`/webhooks/${webhookId}`, { method: 'DELETE' });
}

/**
 * Get available webhook event types
 */
async function getAvailableEvents() {
  return instantlyFetch('/webhooks/events/available');
}

// ============================================================
// EMAIL VERIFICATION
// ============================================================

/**
 * Verify an email address
 */
async function verifyEmail(email) {
  return instantlyFetch('/email-verifications', { method: 'POST', body: { email } });
}

/**
 * Check email verification status
 */
async function getVerificationStatus(email) {
  return instantlyFetch(`/email-verifications/${encodeURIComponent(email)}`);
}

// ============================================================
// BLOCK LIST
// ============================================================

/**
 * Add emails/domains to block list (prevent sending)
 */
async function addToBlockList(entries) {
  return instantlyFetch('/block-list-entries/bulk-create', {
    method: 'POST',
    body: { entries },
  });
}

/**
 * List block list entries
 */
async function listBlockList(params = {}) {
  return instantlyFetch('/block-list-entries', { params });
}

// ============================================================
// SEND TEST EMAIL (for previewing outreach before it goes live)
// ============================================================

/**
 * Send a test/preview email
 * Rate limit: 10 req/min
 */
async function sendTestEmail(data) {
  return instantlyFetch('/emails/send-test', { method: 'POST', body: data });
}

// ============================================================
// WORKSPACE
// ============================================================

/**
 * Get current workspace info
 * Docs: https://developer.instantly.ai/llms.txt → GET /api/v2/workspace
 */
async function getWorkspace() {
  return instantlyFetch('/workspace');
}

/**
 * Get billing/plan details — path changed: was `/workspace/billing/plan` but
 * the v2 docs specify `/workspace-billing/plan`. QA audit 2026-04-15 P1-08.
 */
async function getPlan() {
  return instantlyFetch('/workspace-billing/plan');
}

/**
 * Get subscription details (new in v2 docs)
 */
async function getSubscription() {
  return instantlyFetch('/workspace-billing/subscription');
}

module.exports = {
  // Configuration check (so routes can 503 gracefully)
  isConfigured,
  InstantlyApiError,
  // Campaigns
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  activateCampaign,
  stopCampaign,
  getCampaignAnalytics,
  getAnalyticsOverview,
  getDailyAnalytics,
  getStepsAnalytics,
  // Leads
  bulkAddLeads,
  getLead,
  updateLead,
  updateLeadInterest,
  moveLeads,
  searchByEmail,
  // Email Accounts
  listAccounts,
  getAccount,
  testAccountVitals,
  getAccountDailyAnalytics,
  // Webhooks
  createWebhook,
  listWebhooks,
  deleteWebhook,
  getAvailableEvents,
  // Verification
  verifyEmail,
  getVerificationStatus,
  // Block List
  addToBlockList,
  listBlockList,
  // Test Email
  sendTestEmail,
  // Workspace
  getWorkspace,
  getPlan,
  getSubscription,
};
