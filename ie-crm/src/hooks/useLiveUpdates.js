// useLiveUpdates — Listens for real-time CRM record changes via socket.io
// When Houston creates/updates a record, the relevant page refreshes automatically.
//
// Usage in any page:
//   useLiveUpdates('action_item', loadData);
//   useLiveUpdates(['contact', 'interaction'], loadData);

import { useEffect } from 'react';
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
 * Listen for CRM record changes and call refresh when relevant entity type changes.
 * @param {string|string[]} entityTypes — entity type(s) to watch (e.g., 'action_item', 'contact')
 * @param {function} onRefresh — callback to refresh the page data
 */
export default function useLiveUpdates(entityTypes, onRefresh) {
  useEffect(() => {
    if (!onRefresh) return;

    const types = Array.isArray(entityTypes) ? entityTypes : [entityTypes];
    const sock = getSocket();

    const handler = (event) => {
      if (types.includes(event.entityType)) {
        // Small delay to ensure DB write is committed before we query
        setTimeout(() => onRefresh(), 300);
      }
    };

    sock.on('crm:record:changed', handler);

    return () => {
      sock.off('crm:record:changed', handler);
    };
  }, [entityTypes, onRefresh]);
}
