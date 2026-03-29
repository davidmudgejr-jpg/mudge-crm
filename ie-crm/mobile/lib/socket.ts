// Socket.io singleton — connects to the same Railway server
// JWT auth is passed in the handshake, same as the web CRM

import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

// Railway production URL — works everywhere
const API_BASE = 'https://mudge-crm-production.up.railway.app';

let socket: Socket | null = null;

export async function getSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  const token = await getToken();
  if (!token) throw new Error('No auth token for socket connection');

  socket = io(API_BASE, {
    auth: { token },
    transports: ['websocket'], // Skip long-polling — faster on mobile
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocketInstance(): Socket | null {
  return socket;
}
