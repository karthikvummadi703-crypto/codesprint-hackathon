/** Knowledge-base document upload and deletion requests. */
import { API_BASE_URL } from './firebase';
import { apiRequest } from './apiClient';
import { authHeaders } from './backendServiceClient';

export async function uploadDocumentForRag(file: File): Promise<{
  fileId: string;
  fileName: string;
  chunkCount: number;
  textPreview: string;
}> {
  const { token } = await authHeaders();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE_URL}/api/rag/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    let detail = `Upload failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && data.detail) detail = String(data.detail);
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return await res.json();
}

export async function deleteRagFile(fileId: string): Promise<void> {
  const { token } = await authHeaders();
  await apiRequest(`/api/rag/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    token,
  });
}
