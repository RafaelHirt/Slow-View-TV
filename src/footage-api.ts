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
  outputLicense?: string; outputLicenseUrl?: string;
};
export type NrkImport = {
  enabled: boolean; available: boolean;
  source: { id: string; title: string; bytes: number; licenseUrl: string };
  download: null | { status: 'downloading' | 'verifying' | 'paused' | 'failed' | 'ready'; completed: number; total: number; error: string | null; assetId: string | null; asset?: FootageAsset;
    diagnostics?: { exitCode: number | null; signal: string | null; elapsedSeconds: number; completed: number; maxConnections: number | null; maxSeeders: number | null; trackerFailures: number; errorCodes: number[]; reason: string | null;
      source?: 'nytsoi' | 'nrk'; contentVerified?: boolean; privateTorrent?: boolean; resumeRechecked?: boolean;
    } | null;
  };
};
export type StockVideo = { id: string; title: string; sourceUrl: string; author: string; duration: number; width: number; height: number; fileUrl: string };
export const mediaUrl = (path: string) => `${apiBase}${path}`;
export const footageApi = {
  nrk: () => request<NrkImport>('/footage/nrk'),
  importNrk: () => request<NrkImport>('/footage/nrk/flamsbanen', { method: 'POST' }),
  pauseNrk: () => request<NrkImport>('/footage/nrk/flamsbanen/pause', { method: 'POST' }),
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
