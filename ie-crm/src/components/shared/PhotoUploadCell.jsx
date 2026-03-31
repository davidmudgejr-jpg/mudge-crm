import React, { useState, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Inline photo upload cell for CrmTable.
 * Shows a large image that fills the row height.
 * - Empty: shows a clickable placeholder
 * - Has photo: shows full-width thumbnail with hover preview + remove button
 * - Uploading: shows spinner
 */
export default function PhotoUploadCell({ url, rowId, onSave, folder = 'deals', field = 'photo_url' }) {
  const [uploading, setUploading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('crm-auth-token');
      const res = await fetch(`${API}/api/files/upload?folder=${folder}`, {
        method: 'POST',
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      await onSave(rowId, field, data.url);
    } catch (err) {
      console.error('[PhotoUploadCell] Upload error:', err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemove = async (e) => {
    e.stopPropagation();
    await onSave(rowId, field, null);
  };

  // Shared dimensions: 3:2 aspect ratio that fills the column nicely
  const SIZE = 'w-[120px] h-[80px]';

  // Loading state
  if (uploading) {
    return (
      <div className={`${SIZE} rounded-md border border-crm-border flex items-center justify-center bg-crm-hover`}>
        <svg className="w-5 h-5 animate-spin text-crm-muted" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
        </svg>
      </div>
    );
  }

  // Has photo — show thumbnail with 3:2 ratio, cropped to fit
  if (url) {
    return (
      <div
        className={`relative ${SIZE} group`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <img
          src={url}
          alt=""
          className={`${SIZE} rounded-md object-cover border border-crm-border cursor-pointer hover:opacity-90 transition-opacity`}
          onClick={(e) => {
            e.stopPropagation();
            fileRef.current?.click();
          }}
          onError={(e) => { e.target.src = ''; e.target.alt = '?'; }}
        />
        {/* Remove button */}
        <button
          onClick={handleRemove}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
          title="Remove photo"
        >
          ×
        </button>
        {/* Hover preview — larger version */}
        {hovered && (
          <div className="absolute z-50 bottom-full left-0 mb-2 p-1 bg-crm-card border border-crm-border rounded-lg shadow-xl pointer-events-none">
            <img src={url} alt="" className="max-w-[300px] max-h-[300px] rounded object-contain" />
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUpload}
        />
      </div>
    );
  }

  // Empty — show upload placeholder matching the same size
  return (
    <div>
      <button
        onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
        className={`${SIZE} rounded-md border border-dashed border-crm-border text-crm-muted hover:border-crm-accent hover:text-crm-accent transition-colors flex items-center justify-center`}
        title="Upload photo"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}
