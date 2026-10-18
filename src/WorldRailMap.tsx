import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowRight, Check, ChevronRight, CloudRain, Compass, ExternalLink, Globe2, Layers, LoaderCircle, MapPin, Plus, Search, ShieldCheck, TrainFront, Upload } from 'lucide-react';
import type { Route, RoutePlan } from './types';
import { seasonLabels, timeLabels, weatherLabels } from './types';
import { request } from './api';
import type { RailDetail, RailSearchResponse, RailService } from './railway-types';

interface Props {
  routes: Route[]; plans: RoutePlan[];
  onOpenRoute: (route: Route) => void; onPlan: () => void; onImportGPX: () => void;
  onImported: (route: Route) => Promise<void>;
}

export function WorldRailMap({ routes, plans, onOpenRoute, onPlan, onImportGPX, onImported }: Props) {
  const host = useRef<HTMLDivElement>(null); const map = useRef<L.Map | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null); const serviceLayer = useRef<L.LayerGroup | null>(null);
  const [query, setQuery] = useState(''); const [ready, setReady] = useState(false); const [railTiles, setRailTiles] = useState(false);
  const [message, setMessage] = useState(''); const [searching, setSearching] = useState(false); const [inspecting, setInspecting] = useState(false);
  const [services, setServices] = useState<RailService[]>([]); const [detail, setDetail] = useState<RailDetail | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null); const [importing, setImporting] = useState(false); const [viewValid, setViewValid] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const callbacks = useRef({ onOpenRoute }); callbacks.current = { onOpenRoute };
  const selected = routes.find((r) => r.id === chosenId);
  const needle = query.trim().toLocaleLowerCase('pt-BR');
  const visibleRoutes = useMemo(() => routes.filter((r) => r.name.toLocaleLowerCase('pt-BR').includes(needle)), [routes, needle]);
  const visiblePlans = plans.filter((p) => `${p.name} ${p.origin} ${p.destination}`.toLocaleLowerCase('pt-BR').includes(needle));

  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, { center: [22, 8], zoom: 2, minZoom: 2, maxZoom: 17, zoomControl: false, preferCanvas: true, worldCopyJump: true, attributionControl: true });
    map.current = instance;
    instance.attributionControl.setPrefix('');
    instance.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth</a> · mapa-base simplificado');
    L.control.zoom({ position: 'bottomleft' }).addTo(instance);
    routeLayer.current = L.layerGroup().addTo(instance);
    serviceLayer.current = L.layerGroup().addTo(instance);
    const controller = new AbortController();
    fetch('/data/countries-110m.geojson', { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((countries) => {
      if (controller.signal.aborted) return;
      L.geoJSON(countries, { style: { fillColor: '#d5dfcc', fillOpacity: 1, color: '#aebfa2', weight: .6 }, onEachFeature: (feature, layer) => { if (typeof feature.properties?.name === 'string') layer.bindTooltip(feature.properties.name, { sticky: true, className: 'country-tooltip' }); } }).addTo(instance).bringToBack();
    }).catch(() => { if (!controller.signal.aborted) setMessage('Não foi possível carregar o mapa-base local. As rotas salvas continuam disponíveis.'); });
    const moved = () => {
      const b = instance.getBounds(); const width = b.getEast() - b.getWest(); const height = b.getNorth() - b.getSouth();
      setViewValid(width > 0 && height > 0 && width <= 4 && height <= 4 && width * height <= 4 && b.getWest() >= -180 && b.getEast() <= 180);
    };
    instance.on('moveend zoomend', moved); moved(); setReady(true);
    const resize = new ResizeObserver(() => instance.invalidateSize()); resize.observe(host.current);
    return () => { controller.abort(); resize.disconnect(); instance.remove(); map.current = null; routeLayer.current = null; serviceLayer.current = null; };
  }, []);

  useEffect(() => {
    if (!ready || !map.current || !routeLayer.current) return;
    routeLayer.current.clearLayers();
    for (const route of routes) {
      const line = L.polyline(route.points.map((p) => [p.lat, p.lon] as L.LatLngTuple), { color: route.id === chosenId ? '#314e3a' : route.isDemo ? '#c29863' : '#6a8d5c', weight: route.id === chosenId ? 6 : 4, opacity: .95, ...(route.isDemo ? { dashArray: '6 5' } : {}) }).addTo(routeLayer.current);
      line.bindTooltip(() => { const div = document.createElement('div'); div.textContent = `${route.name} · ${route.variants.length} atmosferas${route.isDemo ? ' · demonstração' : ''}`; return div; });
      line.on('click', () => { setChosenId(route.id); setDetail(null); map.current?.fitBounds(line.getBounds(), { padding: [65, 65], maxZoom: 12 }); });
      line.on('dblclick', () => callbacks.current.onOpenRoute(route));
    }
  }, [ready, routes, chosenId]);

  useEffect(() => {
    if (!ready || !map.current || !railTiles) return;
    let warned = false;
    const tiles = L.tileLayer('https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', { attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · <a href="https://www.openrailwaymap.org/" target="_blank" rel="noreferrer">OpenRailwayMap</a>', maxNativeZoom: 19, maxZoom: 19, minZoom: 2, opacity: .8, crossOrigin: 'anonymous' });
    tiles.on('tileerror', () => { if (!warned) { warned = true; setMessage('A camada de trilhos não respondeu. O mapa local e seu catálogo continuam disponíveis. Verifique o acesso a a.tiles.openrailwaymap.org.'); } });
    tiles.addTo(map.current);
    return () => { tiles.remove(); };
  }, [ready, railTiles]);

  useEffect(() => {
    if (!ready || !serviceLayer.current) return;
    serviceLayer.current.clearLayers();
    if (detail?.points.length) L.polyline(detail.points.map((p) => [p.lat, p.lon] as L.LatLngTuple), { color: '#ae8758', weight: 4, dashArray: '7 4' }).addTo(serviceLayer.current);
    for (const service of services) {
      if (!service.center) continue;
      const marker = L.circleMarker([service.center.lat, service.center.lon], { radius: 6, color: '#fffef1', weight: 2, fillColor: '#a47d4f', fillOpacity: 1 }).addTo(serviceLayer.current);
      marker.bindTooltip(() => { const div = document.createElement('div'); div.textContent = service.name; return div; });
      marker.on('click', () => void inspect(service));
    }
  }, [ready, services, detail]);

  async function search() {
    if (!map.current || !viewValid || searching) return;
    const bounds = map.current.getBounds();
    const bbox = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].map((v) => v.toFixed(5)).join(',');
    setSearching(true); setMessage(''); setHasSearched(true); setServices([]); setDetail(null);
    try {
      const response = await request<RailSearchResponse>(`/railway/routes?bbox=${encodeURIComponent(bbox)}`);
      setServices(response.routes);
      if (response.truncated) setMessage('A consulta retornou uma seleção limitada. Aproxime o mapa para explorar uma área menor.');
      else if (!response.routes.length) setMessage('Nenhuma relação de rota de trem foi encontrada nesta área. Isso não comprova ausência de trilhos ou de serviços.');
    } catch (e) { setMessage((e as Error).message); } finally { setSearching(false); }
  }
  async function inspect(service: RailService) {
    const saved = routes.find((route) => route.id === `osm-relation-${service.relationId}`);
    if (saved) { focusRoute(saved); return; }
    setChosenId(null); setInspecting(true); setMessage(''); setDetail(null);
    try {
      const response = await request<RailDetail>(`/railway/relations/${service.relationId}`); setDetail(response);
      if (response.points.length) map.current?.fitBounds(response.points.map((p) => [p.lat, p.lon] as L.LatLngTuple), { padding: [50, 50], maxZoom: 11 });
    } catch (e) { setMessage((e as Error).message); } finally { setInspecting(false); }
  }
  async function importRelation() {
    if (!detail?.diagnostics.valid) return;
    setImporting(true); setMessage('');
    try { const route = await request<Route>('/railway/import', { method: 'POST', body: JSON.stringify({ relationId: detail.relationId, name: detail.name }) }); await onImported(route); }
    catch (e) { setMessage((e as Error).message); } finally { setImporting(false); }
  }
  function focusRoute(route: Route) {
    setChosenId(route.id); setDetail(null);
    map.current?.fitBounds(route.points.map((p) => [p.lat, p.lon] as L.LatLngTuple), { padding: [60, 60], maxZoom: 12 });
  }
  return <>
    <div className="page-title"><div><div className="eyebrow">UMA JANELA PARA TODOS OS CAMINHOS</div><h1>O mundo, no seu ritmo.</h1><p>Explore ferrovias. Escolha uma rota. Descubra as atmosferas que já criou.</p></div><button className="button primary" onClick={onPlan}><Plus size={16} />Planejar viagem</button></div>
    <div className="atlas-layout"><section className="atlas-map-card"><div className="atlas-toolbar"><span><Globe2 size={16} />Atlas ferroviário</span><div><button className="text-button" onClick={() => map.current?.setView([22, 8], 2)}><Globe2 size={13} />Mundo</button><button className="text-button" onClick={() => map.current?.fitBounds([[48.12, 14.3], [50.2, 16.6]], { padding: [40, 40] })}><MapPin size={13} />Viena–Praga</button></div></div>
      <div className="atlas-map-host" ref={host} role="region" aria-label="Mapa mundial interativo de rotas ferroviárias" />
      <div className="atlas-map-controls"><label className="atlas-layer-switch"><input type="checkbox" checked={railTiles} onChange={(e) => setRailTiles(e.target.checked)} /><Layers size={15} />Trilhos do mundo <span>online</span></label><button className="button primary" disabled={!viewValid || searching} onClick={() => void search()} title={viewValid ? 'Consultar relações de rotas de trem no OpenStreetMap' : 'Aproxime o mapa para consultar uma área menor'}>{searching ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}Buscar rotas nesta área</button></div>
      <div className="atlas-legend"><span><i className="legend-line" />No seu catálogo</span><span><i className="legend-line demo" />Demonstração</span><span><i className="legend-dot" />Relação OSM encontrada</span></div>
      {!viewValid && <p className="atlas-zoom-hint">Aproxime o mapa para consultar rotas em uma área pequena. A rede mundial é carregada por região.</p>}
      {message && <div className="atlas-message" role="status">{message}</div>}
    </section><aside className="atlas-catalog"><div className="atlas-catalog-header"><h2>Seus caminhos</h2><span>{routes.length} rotas · {routes.reduce((n, r) => n + r.variants.length, 0)} atmosferas</span></div><div className="atlas-search"><Search size={15} /><input aria-label="Filtrar rotas salvas" placeholder="Encontre uma viagem…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      {visibleRoutes.map((route) => <button className={`atlas-route-item ${chosenId === route.id ? 'selected' : ''}`} key={route.id} onClick={() => focusRoute(route)}><span className="atlas-route-icon"><TrainFront size={19} /></span><span><strong>{route.name}</strong><small>{route.variants.length} atmosferas · {route.distanceKm.toFixed(1)} km{route.isDemo ? ' · demonstração' : ''}</small></span><ChevronRight size={15} /></button>)}
      {visiblePlans.map((plan) => <div className="atlas-plan-item" key={plan.id}><MapPin size={17} /><div><strong>{plan.name}</strong><small>Em preparação · aguardando traçado</small></div></div>)}
      {!visibleRoutes.length && !visiblePlans.length && <div className="atlas-empty"><Compass size={28} strokeWidth={1.3} /><p>{query ? 'Nenhum caminho com esse nome.' : 'Seu catálogo começa com a primeira rota.'}</p></div>}
      <button className="text-button atlas-import" onClick={onImportGPX}><Upload size={14} />Importar percurso GPX</button>
      {selected && <div className="atlas-route-detail"><span className="eyebrow">CONFIGURAÇÕES SALVAS</span><h3>{selected.name}</h3>{selected.variants.length ? <div className="atlas-variants">{selected.variants.map((v) => <div key={v.id}><CloudRain size={15} /><span><strong>{v.name}</strong><small>{seasonLabels[v.season]} · {timeLabels[v.timeOfDay]} · {weatherLabels[v.weather]}</small></span><Check size={14} /></div>)}</div> : <p className="atlas-detail-note">Esta rota ainda não tem atmosferas. Crie a primeira versão.</p>}<button className="button primary full-width" onClick={() => onOpenRoute(selected)}>Abrir esta rota<ArrowRight size={15} /></button></div>}
      {inspecting && <div className="atlas-empty"><LoaderCircle className="spin" size={24} /><p>Verificando continuidade do traçado…</p></div>}
      {detail && <div className="atlas-route-detail"><span className="eyebrow">ROTA DO OPENSTREETMAP</span><h3>{detail.name}</h3><p className="atlas-detail-note">{detail.from || 'Origem não informada'} → {detail.to || 'Destino não informado'}</p>{detail.diagnostics.valid ? <div className="atlas-valid"><ShieldCheck size={17} /><span>Traçado contínuo · {detail.points.length.toLocaleString('pt-BR')} pontos<br /><small>Continuidade geométrica verificada. Horários e operação precisam de validação.</small></span></div> : <div className="atlas-invalid">{detail.diagnostics.issues.map((issue, i) => <p key={i}>{issue.message}</p>)}</div>}<a className="text-button" href={detail.sourceUrl} target="_blank" rel="noreferrer">Consultar fonte OSM<ExternalLink size={12} /></a><button className="button primary full-width" disabled={!detail.diagnostics.valid || importing} onClick={() => void importRelation()}>{importing ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}Adicionar ao catálogo</button></div>}
      {hasSearched && <div className="atlas-found"><h3>Rotas encontradas <span>{services.length}</span></h3>{services.map((service) => <button key={service.relationId} onClick={() => void inspect(service)}><TrainFront size={14} /><span>{service.name}<small>{service.ref || service.operator || `Relação ${service.relationId}`}</small></span><ChevronRight size={13} /></button>)}{!services.length && !searching && <p>Consulte outra área ou verifique a conexão com o provedor.</p>}</div>}
    </aside></div>
    <div className="honesty-note"><ShieldCheck size={18} /><p><strong>Rede física e rotas de passageiros são camadas diferentes.</strong> O OpenRailwayMap mostra infraestrutura mapeada. As consultas OSM retornam relações cadastradas; a cobertura e a continuidade variam. O catálogo registra as rotas que você preparou, sem prometer todos os serviços existentes.</p></div>
  </>;
}
