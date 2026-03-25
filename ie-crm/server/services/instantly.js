/**
 * Instantly.ai API v2 Service
 * Handles all communication with Instantly.ai for email campaigns.
 * Used by Campaign Manager agent endpoints in ai.js.
 *
 * Docs: https://developer.instantly.ai/
 * Auth: Bearer token (API key with scopes)
 * Base URL: https://api.instantly.ai/api/v2
 */

const BASE_URL = 'https://api.instantly.ai/api/v2';

function getApiKey() {
  const key = process.env.INSTANTLY_API_KEY;
  if (!key) throw new Error('INSTANTLY_API_KEY not set in environment');
  return key;
}

async function instantlyFetch(path, options = {}) {
  const { method = 'GET', body, params } = options;

  let url = `${BASE_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }

  const fetchOptions = {
    method,
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
  };

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  const res = await fetch(url, fetchOptions);

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Instantly API ${method} ${path} returned ${res.status}: ${errorText}`);
  }

  // Some endpoints return no body (204)
  if (res.status === 204) return null;
  return res.json();
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
 */
async function getWorkspace() {
  return instantlyFetch('/workspace');
}

/**
 * Get billing/plan details
 */
async function getPlan() {
  return instantlyFetch('/workspace/billing/plan');
}

module.exports = {
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
};
