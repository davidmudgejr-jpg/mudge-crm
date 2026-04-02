import React, { useState, useRef, useEffect } from 'react';

const CAMPAIGN_TYPES = ['Email', 'Direct Mail', 'Cold Call', 'Door Knock', 'SMS', 'Social Media', 'Event'];
const CAMPAIGN_STATUSES = ['Draft', 'Scheduled', 'Active', 'Sent', 'Completed', 'Paused'];

/**
 * Modal for creating a new campaign and bulk-linking contacts.
 * Shows name (required), type, and status fields.
 */
export default function CreateCampaignModal({ contactCount, onSubmit, onClose, loading }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('Draft');
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), type: type || null, status: status || null });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-crm-card border border-crm-border rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3">
          <h2 className="text-base font-semibold text-crm-text">Create Campaign</h2>
          <p className="text-xs text-crm-muted mt-1">
            {contactCount} contact{contactCount !== 1 ? 's' : ''} will be added to this campaign
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-3">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-crm-muted mb-1">
              Campaign Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Q1 Lease Expiration Outreach"
              className="w-full bg-crm-bg border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:ring-2 focus:ring-crm-accent/40 focus:border-crm-accent/50"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-crm-muted mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-crm-bg border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text focus:outline-none focus:ring-2 focus:ring-crm-accent/40 focus:border-crm-accent/50"
            >
              <option value="">—</option>
              {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-crm-muted mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-crm-bg border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text focus:outline-none focus:ring-2 focus:ring-crm-accent/40 focus:border-crm-accent/50"
            >
              {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-crm-muted hover:text-crm-text rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="px-4 py-2 text-xs font-medium text-white bg-crm-accent hover:bg-crm-accent-hover rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating...
                </>
              ) : (
                `Create & Link ${contactCount} Contact${contactCount !== 1 ? 's' : ''}`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
