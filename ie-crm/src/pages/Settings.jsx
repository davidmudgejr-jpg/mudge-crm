import React, { useState, useEffect, useCallback } from 'react';
import { syncTable, getAvailableTables, getStatus as getAirtableStatus } from '../api/airtable';
import { query, migrateOldNotes, dropOldNotesColumns, ensureNotesFKColumns } from '../api/database';
import { db, claude as claudeBridge, airtable as airtableBridge, settings } from '../api/bridge';

function StatusBadge({ ok, label }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
      ok ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
    }`}>
      {label || (ok ? 'Connected' : 'Not configured')}
    </span>
  );
}

function ConnectionCard({ title, description, status, icon }) {
  return (
    <div className="bg-crm-card border border-crm-border rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-crm-accent/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-4.5 h-4.5 text-crm-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium">{title}</h3>
            <p className="text-xs text-crm-muted mt-0.5">{description}</p>
          </div>
        </div>
        <StatusBadge ok={status} />
      </div>
    </div>
  );
}

export default function Settings() {
  const [dbStatus, setDbStatus] = useState(null);
  const [claudeStatus, setClaudeStatus] = useState(null);
  const [airtableStatus, setAirtableStatus] = useState(null);
  const [envInfo, setEnvInfo] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [syncProgress, setSyncProgress] = useState({});
  const [syncLog, setSyncLog] = useState([]);
  const [dbStats, setDbStats] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [migrating, setMigrating] = useState(null);

  const tables = getAvailableTables();

  const checkStatuses = useCallback(async () => {
    try {
      const dbRes = await db.status();
      setDbStatus(dbRes?.connected || false);
    } catch {
      setDbStatus(false);
    }

    try {
      const claudeRes = await claudeBridge.status();
      setClaudeStatus(claudeRes?.configured || false);
    } catch {
      setClaudeStatus(false);
    }

    try {
      const atRes = await getAirtableStatus();
      setAirtableStatus(atRes?.configured || false);
    } catch {
      setAirtableStatus(false);
    }

    try {
      const env = await settings.getEnv();
      setEnvInfo(env || {});
    } catch {
      setEnvInfo({});
    }
  }, []);

  const fetchDbStats = useCallback(async () => {
    try {
      const tables = ['properties', 'contacts', 'companies', 'deals', 'interactions', 'campaigns'];
      const counts = {};
      for (const t of tables) {
        const res = await query(`SELECT COUNT(*) as count FROM ${t}`);
        counts[t] = parseInt(res.rows?.[0]?.count || 0, 10);
      }
      setDbStats(counts);
    } catch (err) {
      console.error('Failed to fetch DB stats:', err);
    }
  }, []);

  useEffect(() => {
    checkStatuses();
    fetchDbStats();
  }, [checkStatuses, fetchDbStats]);

  const addLog = (msg, type = 'info') => {
    setSyncLog((prev) => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
  };

  const handleSync = async (tableName) => {
    if (syncing) return;
    setSyncing(tableName);
    setSyncProgress({ synced: 0, errors: 0, hasMore: true });
    addLog(`Starting sync for ${tableName}...`);

    try {
      const result = await syncTable(tableName, (progress) => {
        setSyncProgress(progress);
      });
      const errCount = result.errors?.length || 0;
      addLog(`Sync complete: ${result.totalSynced} records synced, ${errCount} errors`, errCount > 0 ? 'warn' : 'success');
      if (errCount > 0) {
        result.errors.slice(0, 5).forEach(e => addLog(`  Record ${e.recordId}: ${e.error}`, 'error'));
        if (errCount > 5) addLog(`  ... and ${errCount - 5} more errors`, 'error');
      }
    } catch (err) {
      addLog(`Sync failed: ${err.message}`, 'error');
    } finally {
      setSyncing(null);
      setSyncProgress({});
      fetchDbStats();
    }
  };

  const handleSyncAll = async () => {
    if (syncing) return;
    addLog('Starting full sync of all tables...');

    for (const table of tables) {
      setSyncing(table);
      setSyncProgress({ synced: 0, errors: 0, hasMore: true });
      addLog(`Syncing ${table}...`);

      try {
        const result = await syncTable(table, (progress) => {
          setSyncProgress(progress);
        });
        const errCount = result.errors?.length || 0;
        addLog(`${table}: ${result.totalSynced} synced, ${errCount} errors`, errCount > 0 ? 'warn' : 'success');
      } catch (err) {
        addLog(`${table} failed: ${err.message}`, 'error');
      }
    }

    setSyncing(null);
    setSyncProgress({});
    addLog('Full sync complete.', 'success');
    fetchDbStats();
  };

  const handleTestAirtable = async (tableName = 'Properties') => {
    setTesting(true);
    setTestResult(null);
    addLog(`Testing Airtable connection for "${tableName}"...`);
    try {
      const result = await airtableBridge.test(tableName);
      setTestResult(result);
      if (result.ok) {
        addLog(`Test OK: ${result.recordCount} records returned, ${result.fieldNames?.length || 0} fields`, 'success');
      } else {
        addLog(`Test failed: HTTP ${result.status} — ${result.error || result.rawBody?.slice(0, 200)}`, 'error');
      }
    } catch (err) {
      setTestResult({ error: err.message });
      addLog(`Test error: ${err.message}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleEnsureFKColumns = async () => {
    setMigrating('fk');
    addLog('Adding interaction_id and campaign_id FK columns to notes table...');
    try {
      await ensureNotesFKColumns();
      addLog('FK columns added successfully.', 'success');
    } catch (err) {
      addLog(`Failed to add FK columns: ${err.message}`, 'error');
    } finally {
      setMigrating(null);
    }
  };

  const handleMigrateNotes = async () => {
    setMigrating('migrate');
    addLog('Migrating old notes columns into notes table...');
    try {
      const result = await migrateOldNotes();
      addLog(`Migration complete: ${result.migrated} notes migrated.`, 'success');
    } catch (err) {
      addLog(`Migration failed: ${err.message}`, 'error');
    } finally {
      setMigrating(null);
    }
  };

  const handleDropOldColumns = async () => {
    if (!window.confirm('This will permanently drop old notes columns from all entity tables. This cannot be undone. Continue?')) return;
    setMigrating('drop');
    addLog('Dropping old notes columns from entity tables...');
    try {
      await dropOldNotesColumns();
      addLog('Old notes columns dropped successfully.', 'success');
    } catch (err) {
      addLog(`Failed to drop columns: ${err.message}`, 'error');
    } finally {
      setMigrating(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-4 border-b border-crm-border flex-shrink-0">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-xs text-crm-muted">Manage connections, sync data, and configure your CRM</p>
      </div>

      <div className="px-6 py-5 space-y-6 max-w-3xl">
        {/* Connection Status */}
        <section>
          <h2 className="text-sm font-medium text-crm-muted uppercase tracking-wider mb-3">Connections</h2>
          <div className="space-y-3">
            <ConnectionCard
              title="PostgreSQL Database"
              description={envInfo?.HAS_DATABASE_URL ? 'Railway-hosted database' : 'DATABASE_URL not set in .env'}
              status={dbStatus}
              icon="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
            />
            <ConnectionCard
              title="Claude AI (Anthropic)"
              description={envInfo?.HAS_ANTHROPIC_KEY ? 'API key configured' : 'ANTHROPIC_API_KEY not set in .env'}
              status={claudeStatus}
              icon="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
            <ConnectionCard
              title="Airtable"
              description={envInfo?.HAS_AIRTABLE_KEY
                ? `Base: ${envInfo.AIRTABLE_BASE_ID || 'default'}`
                : 'AIRTABLE_API_KEY not set in .env'}
              status={airtableStatus}
              icon="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </div>
          <button
            onClick={checkStatuses}
            className="mt-3 text-xs text-crm-muted hover:text-crm-text transition-colors"
          >
            Refresh status
          </button>
        </section>

        {/* Database Stats */}
        {dbStats && (
          <section>
            <h2 className="text-sm font-medium text-crm-muted uppercase tracking-wider mb-3">Database Records</h2>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(dbStats).map(([table, count]) => (
                <div key={table} className="bg-crm-card border border-crm-border rounded-lg px-3 py-2.5">
                  <p className="text-xs text-crm-muted capitalize">{table}</p>
                  <p className="text-lg font-semibold mt-0.5">{count.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Airtable Sync */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-crm-muted uppercase tracking-wider">Airtable Sync</h2>
            <button
              onClick={handleSyncAll}
              disabled={!!syncing || !airtableStatus}
              className="text-xs bg-crm-accent hover:bg-crm-accent-hover disabled:opacity-40 disabled:hover:bg-crm-accent text-white font-medium px-3 py-1.5 rounded transition-colors"
            >
              Sync All Tables
            </button>
          </div>

          {!airtableStatus && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 text-xs text-yellow-400 mb-3">
              Airtable is not configured. Add AIRTABLE_API_KEY and AIRTABLE_BASE_ID to your .env file.
            </div>
          )}

          <div className="space-y-2">
            {tables.map((table) => (
              <div
                key={table}
                className="bg-crm-card border border-crm-border rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{table}</p>
                  {syncing === table && (
                    <div className="mt-1.5">
                      <div className="flex items-center gap-2 text-[10px] text-crm-muted mb-1">
                        <span>{syncProgress.synced || 0} records synced</span>
                        {syncProgress.errors > 0 && (
                          <span className="text-red-400">{syncProgress.errors} errors</span>
                        )}
                      </div>
                      <div className="w-48 h-1.5 bg-crm-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-crm-accent transition-all duration-300 rounded-full"
                          style={{
                            width: syncProgress.hasMore ? '60%' : '100%',
                            animation: syncProgress.hasMore ? 'pulse 1.5s ease-in-out infinite' : 'none',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleSync(table)}
                  disabled={!!syncing || !airtableStatus}
                  className={`text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                    syncing === table
                      ? 'bg-crm-accent/20 text-crm-accent cursor-wait'
                      : 'bg-crm-border/50 text-crm-muted hover:text-crm-text hover:bg-crm-border disabled:opacity-40'
                  }`}
                >
                  {syncing === table ? 'Syncing...' : 'Sync'}
                </button>
              </div>
            ))}
          </div>

          {/* Test Airtable Connection */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => handleTestAirtable('Properties')}
              disabled={testing}
              className="text-xs bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded transition-colors"
            >
              {testing ? 'Testing...' : 'Test Airtable (Properties)'}
            </button>
            <span className="text-[10px] text-crm-muted">Fetches 5 raw records to verify connection</span>
          </div>

          {/* Raw Test Result */}
          {testResult && (
            <div className="mt-3 bg-crm-deep border border-crm-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-crm-border/50 flex items-center justify-between">
                <span className="text-xs font-medium">
                  Raw Airtable Response
                  {testResult.ok && <span className="text-green-400 ml-2">HTTP {testResult.status}</span>}
                  {testResult.error && <span className="text-red-400 ml-2">{testResult.error}</span>}
                  {testResult.status && !testResult.ok && <span className="text-red-400 ml-2">HTTP {testResult.status}</span>}
                </span>
                <button onClick={() => setTestResult(null)} className="text-[10px] text-crm-muted hover:text-crm-text">
                  Close
                </button>
              </div>
              {testResult.fieldNames?.length > 0 && (
                <div className="px-3 py-2 border-b border-crm-border/30">
                  <p className="text-[10px] text-crm-muted mb-1">
                    {testResult.recordCount} records, {testResult.fieldNames.length} fields detected:
                  </p>
                  <p className="text-[10px] text-crm-accent font-mono break-all">
                    {testResult.fieldNames.join(', ')}
                  </p>
                </div>
              )}
              <pre className="px-3 py-2 text-[10px] font-mono text-crm-text overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
                {testResult.rawBody || JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}
        </section>

        {/* Sync Log */}
        {syncLog.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-crm-muted uppercase tracking-wider">Sync Log</h2>
              <button
                onClick={() => setSyncLog([])}
                className="text-[10px] text-crm-muted hover:text-crm-text transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="bg-crm-deep border border-crm-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
              {syncLog.map((entry, i) => (
                <div
                  key={i}
                  className="px-3 py-1.5 text-xs font-mono border-b border-crm-border/30 last:border-0 flex gap-2"
                >
                  <span className="text-crm-muted flex-shrink-0">{entry.time}</span>
                  <span
                    className={
                      entry.type === 'error'
                        ? 'text-red-400'
                        : entry.type === 'warn'
                        ? 'text-yellow-400'
                        : entry.type === 'success'
                        ? 'text-green-400'
                        : 'text-crm-text'
                    }
                  >
                    {entry.msg}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Environment Info */}
        <section>
          <h2 className="text-sm font-medium text-crm-muted uppercase tracking-wider mb-3">Environment</h2>
          <div className="bg-crm-card border border-crm-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                {[
                  { key: 'DATABASE_URL', set: envInfo?.HAS_DATABASE_URL },
                  { key: 'ANTHROPIC_API_KEY', set: envInfo?.HAS_ANTHROPIC_KEY },
                  { key: 'AIRTABLE_API_KEY', set: envInfo?.HAS_AIRTABLE_KEY },
                  { key: 'AIRTABLE_BASE_ID', set: !!envInfo?.AIRTABLE_BASE_ID, value: envInfo?.AIRTABLE_BASE_ID },
                ].map((row) => (
                  <tr key={row.key} className="border-b border-crm-border/50 last:border-0">
                    <td className="px-3 py-2 font-mono text-crm-muted">{row.key}</td>
                    <td className="px-3 py-2 text-right">
                      {row.value ? (
                        <span className="text-crm-text">{row.value}</span>
                      ) : (
                        <span className={row.set ? 'text-green-400' : 'text-red-400'}>
                          {row.set ? 'Set' : 'Not set'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-crm-muted mt-2">
            Environment variables are loaded from <code className="bg-crm-border/50 px-1 py-0.5 rounded">.env</code> in the project root. Restart the app after changes.
          </p>
        </section>

        {/* Notes Migration */}
        <section>
          <h2 className="text-sm font-medium text-crm-muted uppercase tracking-wider mb-3">Notes Migration</h2>
          <p className="text-xs text-crm-muted mb-3">
            Migrate old text-column notes into the unified notes table. Run steps in order.
          </p>
          <div className="space-y-2">
            <div className="bg-crm-card border border-crm-border rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">1. Ensure FK Columns</p>
                <p className="text-[10px] text-crm-muted">Adds interaction_id and campaign_id to notes table</p>
              </div>
              <button
                onClick={handleEnsureFKColumns}
                disabled={!!migrating}
                className="text-xs font-medium px-3 py-1.5 rounded transition-colors bg-crm-border/50 text-crm-muted hover:text-crm-text hover:bg-crm-border disabled:opacity-40"
              >
                {migrating === 'fk' ? 'Running...' : 'Run'}
              </button>
            </div>
            <div className="bg-crm-card border border-crm-border rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">2. Migrate Old Notes</p>
                <p className="text-[10px] text-crm-muted">Copies notes from all entity tables into the notes table</p>
              </div>
              <button
                onClick={handleMigrateNotes}
                disabled={!!migrating}
                className="text-xs font-medium px-3 py-1.5 rounded transition-colors bg-crm-border/50 text-crm-muted hover:text-crm-text hover:bg-crm-border disabled:opacity-40"
              >
                {migrating === 'migrate' ? 'Migrating...' : 'Run'}
              </button>
            </div>
            <div className="bg-crm-card border border-crm-border rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">3. Drop Old Columns</p>
                <p className="text-[10px] text-red-400">Permanently removes old notes columns from entity tables</p>
              </div>
              <button
                onClick={handleDropOldColumns}
                disabled={!!migrating}
                className="text-xs font-medium px-3 py-1.5 rounded transition-colors bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-40"
              >
                {migrating === 'drop' ? 'Dropping...' : 'Drop Columns'}
              </button>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="pb-8">
          <h2 className="text-sm font-medium text-crm-muted uppercase tracking-wider mb-3">About</h2>
          <div className="bg-crm-card border border-crm-border rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-crm-accent flex items-center justify-center text-white font-bold text-sm">
                IE
              </div>
              <div>
                <p className="text-sm font-semibold">IE CRM</p>
                <p className="text-xs text-crm-muted">Inland Empire Commercial Real Estate CRM</p>
              </div>
            </div>
            <p className="text-xs text-crm-muted leading-relaxed">
              Built with Electron, React, PostgreSQL, and Claude AI. Designed for tracking commercial real estate
              properties, contacts, companies, deals, and campaigns in the Inland Empire market.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
