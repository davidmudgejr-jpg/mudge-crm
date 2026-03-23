// ============================================================
// Z-INDEX SCALE — semantic layering for the CRM UI
// ============================================================
// Use these constants instead of arbitrary z-[N] values.
// Each layer name describes its purpose so collisions are obvious.
//
// Layer stack (low → high):
//   base → sticky headers → sidebar tooltips → dropdowns/popovers
//   → detail panels → modals → toasts → interaction detail over modal

export const Z = {
  /** Sticky table headers, sidebar */
  STICKY:          10,
  /** Column resize handles, checkbox columns */
  TABLE_CONTROLS:  20,
  /** Claude panel */
  CLAUDE_PANEL:    30,
  /** Detail panels / slide-overs */
  DETAIL:          40,
  /** Dropdowns, popovers, tooltips, column toggle menus */
  DROPDOWN:        50,
  /** Drag region, top bar */
  TOP_BAR:         50,
  /** Modals (activity, quick-add, link-picker, new-interaction) */
  MODAL:           60,
  /** Nested detail opened FROM a modal (e.g. InteractionDetail from ActivityModal) */
  MODAL_DETAIL:    70,
  /** Toast notifications — always on top */
  TOAST:           80,
  /** Portal dropdowns (e.g. Import field-map dropdown) */
  PORTAL:         100,
};

// Tailwind class equivalents for use in JSX className strings
export const ZC = {
  STICKY:         'z-10',
  TABLE_CONTROLS: 'z-20',
  CLAUDE_PANEL:   'z-30',
  DETAIL:         'z-40',
  DROPDOWN:       'z-50',
  TOP_BAR:        'z-50',
  MODAL:          'z-[60]',
  MODAL_DETAIL:   'z-[70]',
  TOAST:          'z-[80]',
  PORTAL:         'z-[100]',
};
