import { apiBase, request } from './api';

export type MediaMetadata = {
  title: string; license: string; sourceUrl: string; attribution: string; licenseNotes: string; rightsConfirmed: boolean;
};
export type FootageAsset = MediaMetadata & {
  id: string; status: 'uploading' | 'importing' | 'ready' | 'failed'; kind?: 'video' | 'audio';
  duration?: number; width?: number; height?: number; frameRate?: number; hasAudio?: boolean; bytes: number; error?: string; fileUrl?: string;
};
export type FootageEdit = {
  title: string; assetId: string; ambientId: string | null; start: number; end: number;
  resolution: string; audioMode: 'original' | 'ambient' | 'silent';
};
export type FootageExport = FootageEdit & {
  id: string; status: 'queued' | 'editing' | 'completed' | 'failed' | 'cancelled';
  duration: number; width: number; height: number; frameRate?: number; hasAudio: boolean; progress: number;
  error?: string; fileUrl?: string; sources: Omit<MediaMetadata, 'rightsConfirmed'>[];
};
export type StockVideo = { id: string; title: string; sourceUrl: string; author: string; duration: number; width: number; height: number; fileUrl: string };
export const mediaUrl = (path: string) => `${apiBase}${path}`;
export const footageApi = {
  config: () => request<{ pexelsSearch: boolean; maxUploadBytes: number }>('/footage/config'),
  assets: () => request<{ assets: FootageAsset[] }>('/footage/assets'),
  exports: () => request<{ exports: FootageExport[] }>('/footage/exports'),
  create: (body: MediaMetadata) => request<FootageAsset>('/footage/assets', { method: 'POST', body: JSON.stringify(body) }),
  upload: (id: string, file: File) => request<FootageAsset>(`/footage/assets/${id}/content`, {
    method: 'PUT', body: file, headers: { 'Content-Type': 'application/octet-stream' }, signal: AbortSignal.timeout(30 * 60 * 1000),
  }),
  update: (id: string, body: MediaMetadata) => request<FootageAsset>(`/footage/assets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: string) => request<void>(`/footage/assets/${id}`, { method: 'DELETE' }),
  import: (body: MediaMetadata & { fileUrl: string }) => request<FootageAsset>('/footage/import', { method: 'POST', body: JSON.stringify(body) }),
  search: (query: string) => request<{ videos: StockVideo[] }>(`/footage/search?q=${encodeURIComponent(query)}`),
  edit: (body: FootageEdit) => request<FootageExport>('/footage/exports', { method: 'POST', body: JSON.stringify(body) }),
  cancel: (id: string) => request<FootageExport>(`/footage/exports/${id}/cancel`, { method: 'POST' }),
};
