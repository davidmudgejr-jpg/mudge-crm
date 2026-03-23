// useLiveUpdates — Real-time CRM record changes via socket.io
// Supports two modes:
//   1. Simple refresh: useLiveUpdates('action_item', fetchData)
//   2. Smooth insert: useLiveUpdates('action_item', fetchData, { onNewId })
//
// When Houston creates a record, the page can either reload all data
// or smoothly animate the new record into the existing list.

import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
  || import.meta.env.VITE_API_URL
  || (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://mudge-crm-production.up.railway.app'
    : 'http://localhost:3001');

let socket = null;

function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: (cb) => {
        cb({ token: localStorage.getItem('crm-auth-token') });
      },
    });
  }
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

/**
 * Listen for CRM record changes.
 * @param {string|string[]} entityTypes — entity type(s) to watch
 * @param {function} onRefresh — callback to refresh page data
 * @returns {{ newRecordId: string|null }} — ID of most recently created record (for animation)
 */
export default function useLiveUpdates(entityTypes, onRefresh) {
  const [newRecordId, setNewRecordId] = useState(null);

  useEffect(() => {
    if (!onRefresh) return;

    const types = Array.isArray(entityTypes) ? entityTypes : [entityTypes];
    const sock = getSocket();

    const handler = (event) => {
      if (types.includes(event.entityType)) {
        if (event.action === 'created' && event.recordId) {
          // Track the new record ID for animation
          setNewRecordId(event.recordId);
          // Clear after animation completes
          setTimeout(() => setNewRecordId(null), 2000);
        }
        // Refresh data (small delay for DB commit)
        setTimeout(() => onRefresh(), 300);
      }
    };

    sock.on('crm:record:changed', handler);

    return () => {
      sock.off('crm:record:changed', handler);
    };
  }, [entityTypes, onRefresh]);

  return { newRecordId };
}
