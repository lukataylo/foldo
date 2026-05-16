import { api } from './client';

export interface UploadResponse {
  /** Absolute URL path to fetch the uploaded file (e.g. `/api/uploads/up-x.png`). */
  url: string;
  key: string;
  size: number;
  contentType: string;
}

/**
 * Upload a binary file (typically an image) to the server-side blob storage.
 *
 * The server returns a relative URL (`/api/uploads/...`). Image frames use the
 * `content.url` field rather than embedding bytes inline as `dataUrl`, so the
 * frame's `content_json` stays small and the image is cacheable by the CDN
 * and the browser.
 */
export async function uploadImage(file: File): Promise<UploadResponse> {
  const dataBase64 = await fileToBase64(file);
  return api<UploadResponse>('/api/uploads', {
    method: 'POST',
    body: {
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      dataBase64,
    },
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected FileReader result type'));
        return;
      }
      // result is `data:<type>;base64,<payload>`; we only want the payload.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}
