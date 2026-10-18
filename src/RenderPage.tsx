import { useEffect, useState } from 'react';
import { JourneyScene } from './scene/JourneyScene';
import { RouteMap } from './RouteMap';
import { request } from './api';
import type { Route, Variant } from './types';

declare global {
  interface Window { slowvistaRenderer?: { ready: boolean; setProgress: (p: number) => Promise<void> } }
}

export function RenderPage() {
  const [data, setData] = useState<{ route: Route; variant: Variant; outputSeconds: number; width: number; height: number; fps: number }>();
  const [progress, setProgress] = useState(0); const [ready, setReady] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    const job = new URLSearchParams(location.search).get('job');
    if (!job) { setError('Produção não informada.'); return; }
    request<{ route: Route; variant: Variant; outputSeconds: number; width: number; height: number; fps: number }>(`/jobs/${encodeURIComponent(job)}/scene`).then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    window.slowvistaRenderer = { ready: !!data && ready, setProgress: async (p) => {
      setProgress(Math.max(0, Math.min(1, p)));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    } };
    return () => { delete window.slowvistaRenderer; };
  }, [data, ready]);
  if (error) return <div className="render-error">{error}</div>;
  if (!data) return <div>Preparando cena…</div>;
  const { route, variant } = data;
  const width = data.width || 1280; const height = data.height || 720;
  return <div id="render-stage" className="render-stage" style={{ width, height }}>
    <JourneyScene route={route} variant={variant} progress={progress} onReady={() => setReady(true)} />
    <div className="video-overlay-stage" style={{ transform: `scale(${width / 1280})` }}>
    <div className="video-brand">Slow View TV<span>Viagem virtual · cenário ilustrativo</span></div>
    <div className="video-route"><span>{route.name}</span>{variant.temperatureC !== null && <small>{variant.temperatureC}°C · temperatura simulada</small>}</div>
    {variant.showMap && <div className="video-map"><div>{Math.round(progress * 100)}% do percurso</div><RouteMap route={route} progress={progress} compact /></div>}
    {route.isDemo && <div className="video-demo">ROTA DE DEMONSTRAÇÃO</div>}
    </div>
  </div>;
}
