import type { Job, Route, RouteInput, RoutePlan, RoutePlanInput, Variant, VariantInput, VideoResolution } from './types';

export const apiBase = window.location.pathname === '/render' ? '' : (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem('slowvista-token');
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api${path}`, {
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers },
    });
  } catch {
    throw new Error('Não foi possível conectar ao servidor do ateliê. Verifique a conexão e se o servidor está em execução.');
  }
  if (!res.ok) {
    let message = 'Não foi possível concluir. Tente novamente.';
    try { const body = await res.json(); message = typeof body.error === 'string' ? body.error : message; } catch { /* non-JSON proxy errors */ }
    if (res.status === 401 && !path.startsWith('/auth/')) {
      sessionStorage.removeItem('slowvista-token');
      window.dispatchEvent(new Event('slowvista:auth-change'));
      throw new Error('Sua sessão terminou. Entre novamente para continuar.');
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  if (!res.headers.get('Content-Type')?.includes('application/json')) throw new Error('O painel não encontrou a API do ateliê neste endereço. A hospedagem do painel precisa estar conectada ao servidor.');
  try { return await res.json(); } catch { throw new Error('O servidor retornou uma resposta incompleta. Tente novamente.'); }
}
export const api = {
  logout: async () => {
    try { await request<void>('/auth/logout', { method: 'POST' }); }
    finally {
      sessionStorage.removeItem('slowvista-token');
      window.dispatchEvent(new Event('slowvista:auth-change'));
    }
  },
  plans: () => request<{ plans: RoutePlan[] }>('/plans'),
  createPlan: (body: RoutePlanInput) => request<RoutePlan>('/plans', { method: 'POST', body: JSON.stringify(body) }),
  deletePlan: (id: string) => request<void>(`/plans/${id}`, { method: 'DELETE' }),
  routes: () => request<{ routes: Route[] }>('/routes'),
  createRoute: (body: RouteInput) => request<Route>('/routes', { method: 'POST', body: JSON.stringify(body) }),
  deleteRoute: (id: string) => request<void>(`/routes/${id}`, { method: 'DELETE' }),
  createVariant: (id: string, body: VariantInput) => request<Variant>(`/routes/${id}/variants`, { method: 'POST', body: JSON.stringify(body) }),
  deleteVariant: (id: string) => request<void>(`/variants/${id}`, { method: 'DELETE' }),
  jobs: () => request<{ jobs: Job[] }>('/jobs'),
  job: (id: string) => request<Job>(`/jobs/${id}`),
  createJob: (variantId: string, preview: boolean, resolution: VideoResolution = '720p') => request<Job>('/jobs', { method: 'POST', body: JSON.stringify({ variantId, resolution, ...(preview ? { previewSeconds: 8 } : {}) }) }),
  cancelJob: (id: string) => request<Job>(`/jobs/${id}/cancel`, { method: 'POST' }),
};
