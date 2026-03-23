// Interaction type icons — canonical source for all type rendering
// Legacy entries (Call, Email, Note, LinkedIn, Other) kept for old data display

const TYPE_ICONS = {
  // ── Lead ─────────────────────────────────────────────────────────
  Lead: {
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    color: 'text-orange-400 bg-orange-400/15',
  },
  // ── Phone ────────────────────────────────────────────────────────
  'Phone Call': {
    icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
    color: 'text-green-400 bg-green-400/15',
  },
  'Cold Call': {
    icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
    color: 'text-emerald-400 bg-emerald-400/15',
  },
  Voicemail: {
    icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
    color: 'text-lime-400 bg-lime-400/15',
  },
  // ── Email ────────────────────────────────────────────────────────
  'Outbound Email': {
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    color: 'text-blue-400 bg-blue-400/15',
  },
  'Inbound Email': {
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    color: 'text-sky-400 bg-sky-400/15',
  },
  'Cold Email': {
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    color: 'text-indigo-400 bg-indigo-400/15',
  },
  'Check in Email': {
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    color: 'text-teal-400 bg-teal-400/15',
  },
  'Email Campaign': {
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    color: 'text-violet-400 bg-violet-400/15',
  },
  // ── Communication ────────────────────────────────────────────────
  Text: {
    icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    color: 'text-cyan-400 bg-cyan-400/15',
  },
  // ── In-Person ────────────────────────────────────────────────────
  Meeting: {
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    color: 'text-purple-400 bg-purple-400/15',
  },
  Tour: {
    icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
    color: 'text-orange-400 bg-orange-400/15',
  },
  'Door Knock': {
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1',
    color: 'text-amber-400 bg-amber-400/15',
  },
  'Drive By': {
    icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
    color: 'text-slate-400 bg-slate-400/15',
  },
  // ── Outbound / Documents ─────────────────────────────────────────
  'Snail Mail': {
    icon: 'M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5',
    color: 'text-rose-400 bg-rose-400/15',
  },
  'Offer Sent': {
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    color: 'text-emerald-400 bg-emerald-400/15',
  },
  'Survey Sent': {
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    color: 'text-pink-400 bg-pink-400/15',
  },
  'BOV Sent': {
    icon: 'M9 7h6m-6 4h6m-6 4h4M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z',
    color: 'text-fuchsia-400 bg-fuchsia-400/15',
  },
  // ── Legacy (old data still renders correctly) ────────────────────
  Call: {
    icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
    color: 'text-green-400 bg-green-400/15',
  },
  Email: {
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    color: 'text-blue-400 bg-blue-400/15',
  },
  Note: {
    icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z',
    color: 'text-yellow-400 bg-yellow-400/15',
  },
  LinkedIn: {
    icon: 'M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z M4 6a2 2 0 100-4 2 2 0 000 4z',
    color: 'text-sky-400 bg-sky-400/15',
  },
  Other: {
    icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    color: 'text-gray-400 bg-gray-400/15',
  },
};

// Case-insensitive lookup map — handles DB data stored as "note", "phone call", etc.
const TYPE_ICONS_LOWER = Object.fromEntries(
  Object.entries(TYPE_ICONS).map(([k, v]) => [k.toLowerCase(), { ...v, displayName: k }])
);

/**
 * Case-insensitive type lookup. Returns { icon, color, displayName }.
 * displayName is the canonical Title Case form (e.g. "Note", "Phone Call").
 */
export function getTypeInfo(type) {
  if (!type) return { ...TYPE_ICONS.Other, displayName: 'Other' };
  if (TYPE_ICONS[type]) return { ...TYPE_ICONS[type], displayName: type };
  const lower = type.toLowerCase();
  if (TYPE_ICONS_LOWER[lower]) return TYPE_ICONS_LOWER[lower];
  return { ...TYPE_ICONS.Other, displayName: type };
}

// The 17 active interaction types (used in dropdowns/filters)
export const INTERACTION_TYPES = [
  'Lead',
  'Phone Call', 'Cold Call', 'Voicemail',
  'Outbound Email', 'Inbound Email', 'Cold Email', 'Check in Email', 'Email Campaign',
  'Text', 'Meeting', 'Tour',
  'Door Knock', 'Drive By',
  'Snail Mail', 'Offer Sent', 'Survey Sent', 'BOV Sent',
];

// Email-related types — used to show email heading/body fields in detail views
export const EMAIL_TYPES = [
  'Outbound Email', 'Inbound Email', 'Cold Email', 'Check in Email', 'Email Campaign',
  'Email', // legacy
];

export default TYPE_ICONS;
