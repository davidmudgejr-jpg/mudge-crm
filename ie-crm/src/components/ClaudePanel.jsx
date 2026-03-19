import React, { useState, useRef, useEffect, useCallback } from 'react';
import { sendMessage, parseClaudeResponse, SUGGESTED_COMMANDS, getStatus as getClaudeStatus } from '../api/claude';
import { query, logUndo, executeUndo } from '../api/database';
import { file as fileBridge } from '../api/bridge';
import { useAuth } from '../contexts/AuthContext';

function highlightSQL(sql) {
  if (!sql) return '';
  const keywords =
    /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|ILIKE|IS|NULL|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|CASE|WHEN|THEN|ELSE|END|COUNT|SUM|AVG|MAX|MIN|DISTINCT|BETWEEN|EXISTS|UNION|ALL|TRUE|FALSE|ASC|DESC|RETURNING|CONFLICT|DO|ARRAY|DEFAULT|NOW)\b/gi;
  const strings = /('[^']*')/g;
  const numbers = /\b(\d+\.?\d*)\b/g;
  return sql
    .replace(strings, '<span class="sql-string">$1</span>')
    .replace(keywords, '<span class="sql-keyword">$1</span>')
    .replace(numbers, '<span class="sql-number">$1</span>');
}

// ── File attachment helpers ────────────────────────────────────
const ACCEPTED_TYPES = {
  'application/pdf': 'PDF',
  'image/png': 'Image',
  'image/jpeg': 'Image',
  'image/gif': 'Image',
  'image/webp': 'Image',
  'text/csv': 'CSV',
  'text/plain': 'Text',
  'text/tab-separated-values': 'TSV',
  'application/json': 'JSON',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.ms-excel': 'Excel',
};

function fileIcon(type) {
  if (type === 'document' || type === 'PDF') return '📄';
  if (type === 'image' || type === 'Image') return '🖼';
  if (type === 'Excel') return '📊';
  return '📎';
}

// ── Citation block ─────────────────────────────────────────────
function Citations({ sources }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-2 space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-crm-muted">Sources</span>
      {sources.map((s, i) => (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 truncate transition-colors"
          title={s.url}
        >
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          <span className="truncate">{s.title || s.url}</span>
        </a>
      ))}
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────
function MessageBubble({ message, onExecute, onUndo }) {
  const parsed = message.role === 'assistant' ? parseClaudeResponse(message.content) : null;
  const [countdown, setCountdown] = useState(null);
  const [executed, setExecuted] = useState(message.executed || false);
  const [result, setResult] = useState(message.result || null);
  const [undoId, setUndoId] = useState(message.undoId || null);
  const [undone, setUndone] = useState(false);
  const timerRef = useRef(null);

  // Auto-execute for write operations
  useEffect(() => {
    if (parsed?.isWrite && parsed.sql && !executed && countdown === null && !message.executed) {
      setCountdown(1.5);
    }
  }, [parsed, executed, countdown, message.executed]);

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      timerRef.current = setTimeout(() => {
        setCountdown((c) => Math.max(0, c - 0.1));
      }, 100);
    } else if (countdown !== null && countdown <= 0) {
      handleExecute();
    }
    return () => clearTimeout(timerRef.current);
  }, [countdown]);

  const handleExecute = async () => {
    clearTimeout(timerRef.current);
    setCountdown(null);
    try {
      const res = await onExecute(parsed.sql, parsed.undoSql, parsed.explanation);
      setExecuted(true);
      setResult(res);
      setUndoId(res.undoId);
      message.executed = true;
      message.result = res;
      message.undoId = res.undoId;
    } catch (err) {
      setResult({ error: err.message });
      setExecuted(true);
    }
  };

  const handleCancel = () => {
    clearTimeout(timerRef.current);
    setCountdown(null);
  };

  const handleUndo = async () => {
    if (!undoId) return;
    try {
      await onUndo(undoId);
      setUndone(true);
    } catch (err) {
      console.error('Undo failed:', err);
    }
  };

  // ── User message ──
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="bg-crm-accent/20 border border-crm-accent/30 rounded-xl rounded-br-sm px-4 py-2.5 max-w-[90%]">
          {message.attachments?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {message.attachments.map((att, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-[10px] bg-crm-accent/10 border border-crm-accent/20 rounded px-1.5 py-0.5 text-crm-muted"
                >
                  {fileIcon(att.type)} {att.fileName}
                </span>
              ))}
            </div>
          )}
          <span className="text-sm">{message.content}</span>
        </div>
      </div>
    );
  }

  // ── Assistant message ──
  return (
    <div className="mb-4">
      {/* Explanation */}
      {parsed?.explanation && (
        <div className="text-sm text-crm-text mb-2 leading-relaxed">{parsed.explanation}</div>
      )}

      {/* SQL Block */}
      {parsed?.sql && (
        <div className="bg-crm-deep border border-crm-border rounded-lg overflow-hidden mb-2">
          <div className="flex items-center justify-between px-3 py-1.5 bg-crm-border/30 text-[10px] text-crm-muted uppercase tracking-wider">
            <span>SQL</span>
            <span className={parsed.isWrite ? 'text-crm-accent' : 'text-blue-400'}>
              {parsed.isWrite ? 'WRITE' : 'READ'}
            </span>
          </div>
          <pre
            className="p-3 text-xs font-mono overflow-x-auto leading-relaxed"
            dangerouslySetInnerHTML={{ __html: highlightSQL(parsed.sql) }}
          />
        </div>
      )}

      {/* Execute / Countdown */}
      {parsed?.sql && !executed && (
        <div className="flex items-center gap-2 mb-2">
          {countdown !== null ? (
            <>
              <div className="flex-1 h-1.5 bg-crm-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-crm-accent transition-all duration-100"
                  style={{ width: `${(1 - countdown / 1.5) * 100}%` }}
                />
              </div>
              <button
                onClick={handleCancel}
                className="text-xs text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded border border-red-400/30 hover:border-red-400/60 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={handleExecute}
              className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white font-medium px-3 py-1.5 rounded transition-colors"
            >
              Execute
            </button>
          )}
        </div>
      )}

      {/* Result */}
      {result && !result.error && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-crm-success">&#10003;</span>
          <span className="text-crm-success">
            {result.rowCount !== undefined ? `${result.rowCount} rows affected` : 'Query executed'}
          </span>
          {undoId && !undone && (
            <button
              onClick={handleUndo}
              className="text-xs text-crm-muted hover:text-crm-text border border-crm-border rounded px-2 py-0.5 transition-colors ml-auto"
            >
              Undo
            </button>
          )}
          {undone && <span className="text-xs text-yellow-400 ml-auto">Undone</span>}
        </div>
      )}

      {/* Read query results table */}
      {result && !result.error && result.rows?.length > 0 && !parsed?.isWrite && (
        <div className="mt-2 bg-crm-deep border border-crm-border rounded-lg overflow-auto max-h-60">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-crm-border">
                {Object.keys(result.rows[0]).map((col) => (
                  <th key={col} className="px-2 py-1.5 text-left text-crm-muted font-medium whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 50).map((row, i) => (
                <tr key={i} className="border-b border-crm-border/50 hover:bg-crm-hover/50">
                  {Object.values(row).map((val, j) => (
                    <td key={j} className="px-2 py-1 whitespace-nowrap max-w-[200px] truncate">
                      {val === null ? <span className="text-crm-muted italic">null</span> : String(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {result.rows.length > 50 && (
            <div className="text-xs text-crm-muted px-3 py-1.5 border-t border-crm-border">
              Showing 50 of {result.rows.length} rows
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {result?.error && (
        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          Error: {result.error}
        </div>
      )}

      {/* No SQL — just text response */}
      {!parsed?.sql && parsed?.fullText && (
        <div className="text-sm text-crm-text leading-relaxed whitespace-pre-wrap">{parsed.fullText}</div>
      )}

      {/* Web search citations */}
      {message.searchResults && <Citations sources={message.searchResults} />}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────
export default function ClaudePanel({ isOpen, onToggle, currentTable, rowCount, hasAnyPanel }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [dragging, setDragging] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragCountRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const status = await getClaudeStatus();
        setConfigured(status?.configured || false);
      } catch {
        setConfigured(false);
      }
    })();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── File handling ──────────────────────────────────────────
  const processFile = useCallback(async (file) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowed = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'csv', 'txt', 'tsv', 'json', 'xlsx', 'xls', 'xlsm'];
    if (!allowed.includes(ext)) {
      alert(`Unsupported file type: .${ext}`);
      return null;
    }
    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = await fileBridge.parse(arrayBuffer, file.name);
      return { ...parsed, fileName: file.name };
    } catch (err) {
      console.error('File parse error:', err);
      alert(`Failed to parse ${file.name}: ${err.message}`);
      return null;
    }
  }, []);

  const handleFiles = useCallback(
    async (files) => {
      const results = [];
      for (const f of Array.from(files)) {
        const parsed = await processFile(f);
        if (parsed) results.push(parsed);
      }
      if (results.length) setAttachments((prev) => [...prev, ...results]);
    },
    [processFile],
  );

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current = 0;
      setDragging(false);
      if (e.dataTransfer.files?.length) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Send message ───────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if ((!text && !attachments.length) || loading) return;

    const userMsg = {
      role: 'user',
      content: text || '(attached file)',
      attachments: attachments.length ? [...attachments] : undefined,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setAttachments([]);
    setLoading(true);

    try {
      const response = await sendMessage(newMessages, { currentTable, rowCount, userName: user?.display_name });
      const content = response.content && response.content.trim().length > 0
        ? response.content
        : '(No response from Claude — the model returned empty content. Try again.)';
      const assistantMsg = {
        role: 'assistant',
        content,
        rawContent: content,
        searchResults: response.searchResults || null,
      };
      setMessages([...newMessages, assistantMsg]);
    } catch (err) {
      const errMsg = err?.message || 'Unknown error';
      console.error('[ClaudePanel] sendMessage error:', errMsg);
      setMessages([
        ...newMessages,
        { role: 'assistant', content: `Error: ${errMsg}`, rawContent: `Error: ${errMsg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ── SQL execution ──────────────────────────────────────────
  const handleExecute = async (sql, undoSql, description) => {
    try {
      const result = await query(sql);
      let undoId = null;
      if (undoSql) {
        const undoResult = await logUndo(description, sql, undoSql, result.rowCount || 0);
        undoId = undoResult.rows[0]?.undo_id;
      }
      return { ...result, undoId };
    } catch (err) {
      throw err;
    }
  };

  const handleUndo = async (undoId) => {
    await executeUndo(undoId);
  };

  const handleSuggestion = (cmd) => {
    setInput(cmd);
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed top-8 bottom-0 w-[300px] bg-crm-panel glass-liquid border-l border-crm-border/50 flex flex-col transition-all duration-200 ${hasAnyPanel ? 'right-[520px] z-[41]' : 'right-0 z-30'}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragging && (
        <div className="absolute inset-0 z-50 bg-crm-accent/10 border-2 border-dashed border-crm-accent rounded-lg flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <svg className="w-10 h-10 text-crm-accent mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm font-medium text-crm-accent">Drop files here</span>
            <span className="block text-xs text-crm-muted mt-0.5">PDF, Excel, CSV, images</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="no-drag flex items-center justify-between px-4 py-3 border-b border-crm-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-crm-accent/20 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-crm-accent" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </div>
          <span className="font-semibold text-sm">Claude</span>
          {configured === false && (
            <span className="text-[10px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">No API Key</span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="text-crm-muted hover:text-crm-text transition-colors p-1"
          title="Close panel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div>
            <p className="text-crm-muted text-sm mb-4">
              Ask me anything about your CRM data, or give me a command to execute.
            </p>
            <div className="space-y-2">
              {SUGGESTED_COMMANDS.slice(0, 5).map((cmd, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestion(cmd)}
                  className="w-full text-left text-xs text-crm-muted hover:text-crm-text bg-crm-card hover:bg-crm-hover border border-crm-border rounded-lg px-3 py-2 transition-colors"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} onExecute={handleExecute} onUndo={handleUndo} />
          ))
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-crm-muted mb-4">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-crm-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-crm-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-crm-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>Thinking...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div className="flex-shrink-0 px-3 pt-2 flex flex-wrap gap-1.5">
          {attachments.map((att, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-[11px] bg-crm-card border border-crm-border rounded-md px-2 py-1 text-crm-text"
            >
              {fileIcon(att.type)} {att.fileName}
              <button
                onClick={() => removeAttachment(i)}
                className="text-crm-muted hover:text-red-400 ml-0.5 transition-colors"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 border-t border-crm-border p-3">
        <div className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.csv,.txt,.tsv,.json,.xlsx,.xls,.xlsm"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-crm-muted hover:text-crm-text border border-crm-border hover:border-crm-accent/40 rounded-lg px-2 py-2 transition-colors flex-shrink-0"
            title="Attach file"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={attachments.length ? 'Add a message or send files...' : 'Ask Claude or give it a command...'}
            className="flex-1 bg-crm-card border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50 transition-colors"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || (!input.trim() && !attachments.length)}
            className="bg-crm-accent hover:bg-crm-accent-hover disabled:opacity-40 disabled:hover:bg-crm-accent text-white rounded-lg px-3 py-2 transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-crm-muted">
            Viewing: {currentTable} {rowCount > 0 && `(${rowCount.toLocaleString()} rows)`}
          </span>
          <button
            onClick={() => setMessages([])}
            className="text-[10px] text-crm-muted hover:text-crm-text transition-colors"
          >
            Clear chat
          </button>
        </div>
      </div>
    </div>
  );
}
