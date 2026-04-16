#!/usr/bin/env node
// scripts/wait-for-port.js
//
// Wait for a TCP port to accept connections, then exit 0.
// Tiny zero-dep replacement for `wait-on` (which pinned an old axios with
// 2 CRITICAL CVEs — QA audit 2026-04-15 P2-02).
//
// Usage:
//   node scripts/wait-for-port.js <port> [host] [timeoutSeconds]
//
// Exit codes:
//   0  port accepted a connection
//   1  timeout
//   2  bad arguments

'use strict';

const net = require('net');

const [, , portArg, hostArg = '127.0.0.1', timeoutArg = '60'] = process.argv;
const port = parseInt(portArg, 10);
const timeoutMs = parseInt(timeoutArg, 10) * 1000;
const host = hostArg;

if (!Number.isFinite(port) || port <= 0 || port > 65535) {
  console.error('usage: wait-for-port <port> [host] [timeoutSeconds]');
  process.exit(2);
}

const start = Date.now();
const attemptIntervalMs = 250;

function attempt() {
  const socket = new net.Socket();
  let settled = false;

  const onResult = (ok, err) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    if (ok) {
      process.exit(0);
    }
    if (Date.now() - start >= timeoutMs) {
      console.error(`wait-for-port: timed out waiting for ${host}:${port} (${timeoutArg}s)`, err ? `— ${err.message}` : '');
      process.exit(1);
    }
    setTimeout(attempt, attemptIntervalMs);
  };

  socket.once('connect', () => onResult(true));
  socket.once('error', (err) => onResult(false, err));
  socket.connect(port, host);
}

attempt();
