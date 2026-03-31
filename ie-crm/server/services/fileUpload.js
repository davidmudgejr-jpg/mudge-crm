const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

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

  // Try Vercel Blob first (persistent, CDN-backed)
  if (blobToken) {
    try {
      const { put } = require('@vercel/blob');
      const blob = await put(`${folder}/${filename}`, buffer, {
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
      console.error(`[fileUpload] Blob upload failed for ${folder}/${filename}, falling back to local:`, err.message);
    }
  }

  // Fallback: local filesystem (dev only — ephemeral on Railway/Vercel)
  const folderDir = path.join(UPLOADS_DIR, folder);
  if (!fs.existsSync(folderDir)) fs.mkdirSync(folderDir, { recursive: true });

  const localPath = path.join(folderDir, filename);
  fs.writeFileSync(localPath, buffer);

  return {
    url: `/uploads/${folder}/${filename}`,
    filename,
    mime_type: mimetype,
    size_bytes: sizeBytes,
  };
}

/**
 * Delete a file from Vercel Blob or local storage.
 * @param {string} url - The file URL to delete
 */
async function deleteFile(url) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (blobToken && url.includes('vercel-storage.com')) {
    try {
      const { del } = require('@vercel/blob');
      await del(url, { token: blobToken });
    } catch (err) {
      console.error('[fileUpload] Blob delete failed:', err.message);
    }
    return;
  }

  // Local file cleanup
  if (url.startsWith('/uploads/')) {
    const localPath = path.join(UPLOADS_DIR, '..', url);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  }
}

module.exports = { uploadFile, deleteFile };
