const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const ALLOWED_UPLOAD_FOLDERS = new Set(['general', 'deals', 'properties', 'chat']);

function normalizeUploadFolder(folder) {
  if (typeof folder !== 'string' || folder.length === 0) return 'general';
  const normalized = folder.trim().toLowerCase();
  if (!ALLOWED_UPLOAD_FOLDERS.has(normalized)) return 'general';
  return normalized;
}

/**
 * Upload a file to Vercel Blob (persistent) with local filesystem fallback.
 * Organizes files by folder prefix (e.g. "deals/", "properties/", "chat/").
 *
 * @param {Buffer} buffer - File contents
 * @param {string} filename - Unique filename (already timestamped by multer)
 * @param {string} folder - Storage folder prefix (e.g. "deals", "chat")
 * @param {string} mimetype - MIME type (e.g. "image/png")
 * @param {number} sizeBytes - Original file size in bytes
 * @returns {{ url: string, filename: string, mime_type: string, size_bytes: number }}
 */
async function uploadFile(buffer, filename, folder, mimetype, sizeBytes) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const safeFolder = normalizeUploadFolder(folder);

  // Try Vercel Blob first (persistent, CDN-backed)
  if (blobToken) {
    try {
      const { put } = require('@vercel/blob');
      const blob = await put(`${safeFolder}/${filename}`, buffer, {
        access: 'public',
        contentType: mimetype,
        token: blobToken,
      });
      return {
        url: blob.url,
        filename,
        mime_type: mimetype,
        size_bytes: sizeBytes,
      };
    } catch (err) {
      console.error(`[fileUpload] Blob upload failed for ${safeFolder}/${filename}, falling back to local:`, err.message);
    }
  }

  // Fallback: local filesystem (dev only — ephemeral on Railway/Vercel)
  const folderDir = path.join(UPLOADS_DIR, safeFolder);
  if (!fs.existsSync(folderDir)) fs.mkdirSync(folderDir, { recursive: true });

  const localPath = path.join(folderDir, filename);
  fs.writeFileSync(localPath, buffer);

  return {
    url: `/uploads/${safeFolder}/${filename}`,
    filename,
    mime_type: mimetype,
    size_bytes: sizeBytes,
  };
}

// Uploads-path components that are always safe to pass through to fs.unlinkSync.
// Folder + basename must each match this regex — no dots, slashes, null bytes,
// or anything else that could traverse the filesystem.
const SAFE_PATH_COMPONENT_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Delete a file from Vercel Blob or local storage.
 *
 * Hardened against path traversal: the previous implementation did
 * `path.join(UPLOADS_DIR, '..', url)` which let a URL like
 * `/uploads/../../.env` delete files outside the uploads directory.
 * Now we parse the URL, validate each path component against a strict
 * whitelist regex, and resolve-then-double-check the final absolute
 * path is still inside UPLOADS_DIR before unlinking. QA audit P1-10.
 *
 * @param {string} url - The file URL to delete
 */
async function deleteFile(url) {
  if (typeof url !== 'string' || url.length === 0) return;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  // Vercel Blob — the Blob SDK validates its own URL internally
  if (blobToken && url.includes('vercel-storage.com')) {
    try {
      const { del } = require('@vercel/blob');
      await del(url, { token: blobToken });
    } catch (err) {
      console.error('[fileUpload] Blob delete failed:', err.message);
    }
    return;
  }

  // Local file cleanup — strict URL shape, no path traversal
  if (!url.startsWith('/uploads/')) return;

  const parts = url.replace(/^\/uploads\//, '').split('/').filter(Boolean);
  if (parts.length !== 2) {
    console.warn(`[fileUpload] deleteFile: refused URL with ${parts.length} path segments: ${url}`);
    return;
  }
  const [folder, basename] = parts;
  if (!SAFE_PATH_COMPONENT_RE.test(folder) || !SAFE_PATH_COMPONENT_RE.test(basename)) {
    console.warn(`[fileUpload] deleteFile: refused URL with unsafe components: ${url}`);
    return;
  }

  // Resolve both paths and verify the target is still inside UPLOADS_DIR.
  const uploadsAbs = path.resolve(UPLOADS_DIR);
  const targetAbs = path.resolve(uploadsAbs, folder, basename);
  if (!targetAbs.startsWith(uploadsAbs + path.sep) && targetAbs !== uploadsAbs) {
    console.error(`[fileUpload] deleteFile: refused path outside uploads dir: ${targetAbs}`);
    return;
  }

  try {
    if (fs.existsSync(targetAbs)) fs.unlinkSync(targetAbs);
  } catch (err) {
    console.error(`[fileUpload] deleteFile: unlink error for ${targetAbs}:`, err.message);
  }
}

module.exports = { uploadFile, deleteFile, normalizeUploadFolder };
