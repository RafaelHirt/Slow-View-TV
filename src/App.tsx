import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, LogOut, ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, CircleHelp, Cloud, CloudRain, Compass, Copy, Film, FolderHeart, Globe2, Leaf, LoaderCircle, Map, MapPin, Moon, Mountain, Pause, Play, Plus, Route as RouteIcon, Settings2, ShieldCheck, Snowflake, Sprout, Sun, Sunrise, Sunset, TrainFront, Trash2, Upload, Waves, X } from 'lucide-react';
import { api, apiBase } from './api';
import { demoPoints, parseGPX } from './gpx';
import { WorldRailMap } from './WorldRailMap';
import { JourneyScene } from './scene/JourneyScene';
import { RouteMap } from './RouteMap';
import { KnowledgeTab } from './KnowledgeTab';
import type { Job, Route, RouteInput, RoutePlan, RoutePlanInput, Season, TimeOfDay, Variant, VariantInput, Weather, VideoResolution } from './types';
import { seasonLabels, timeLabels, transportLabels, weatherLabels } from './types';

const initialVariant: VariantInput = { name: '', season: 'summer', timeOfDay: 'dawn', weather: 'clear', durationMinutes: 120, temperatureC: null, showMap: true };
const formatDuration = (minutes: number) => minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
const seasonIcons = { spring: Sprout, summer: Sun, autumn: Leaf, winter: Snowflake };
const timeIcons = { dawn: Sunrise, day: Sun, dusk: Sunset, night: Moon };
const weatherIcons = { clear: Sun, cloudy: Cloud, rain: CloudRain, snow: Snowflake };

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand brand-slowview ${compact ? 'small' : ''}`}><img src="/favicon.svg" alt="" /><span>Slow View TV<small>CREATOR STUDIO</small></span></div>;
}

function RouteArt() {
  return <svg viewBox="0 0 900 500" className="route-art" role="img" aria-label="Ilustração de uma viagem tranquila entre montanhas">
    <defs><linearGradient id="sky" x2="0" y2="1"><stop stopColor="#dbe5e0" /><stop offset="1" stopColor="#eff0df" /></linearGradient><linearGradient id="land" x2="0" y2="1"><stop stopColor="#809a89" /><stop offset="1" stopColor="#4f7063" /></linearGradient></defs>
    <rect width="900" height="500" fill="url(#sky)" /><circle cx="650" cy="110" r="52" fill="#e7ce9f" />
    <path d="M0 280 110 140 240 275 400 100 590 280 750 190 900 300V500H0Z" fill="#b5c6bb" />
    <path d="m0 320 180-100 180 100 170-130 230 160 140-80v230H0Z" fill="#97b0a0" />
    <path d="M0 335q180-95 370 15t530-40v190H0Z" fill="url(#land)" />
    <path d="M440 500q-65-110 65-160t15-105" stroke="#d6cdb7" strokeWidth="46" fill="none" />
    <path d="M440 500q-65-110 65-160t15-105" stroke="#7f8980" strokeWidth="26" fill="none" />
    <path d="M440 500q-65-110 65-160t15-105" stroke="#e7e0c8" strokeWidth="3" strokeDasharray="12 14" fill="none" />
    {[80, 135, 210, 720, 790, 840].map((x, i) => <g key={x} transform={`translate(${x} ${320 + i % 3 * 25})`}><path d="m0-45-24 65h48Z" fill="#426552" /><path d="M0 10v30" stroke="#536c55" strokeWidth="5" /></g>)}
    <path d="M0 465q160-80 300 35H0Z" fill="#466354" />
  </svg>;
}

export default function App() {
  const [routes, setRoutes] = useState<Route[]>([]); const [jobs, setJobs] = useState<Job[]>([]);
  const [plans, setPlans] = useState<RoutePlan[]>([]);
  const [showPlan, setShowPlan] = useState(false); const [importPlan, setImportPlan] = useState<RoutePlan | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null); const [tab, setTab] = useState<'atlas' | 'routes' | 'jobs' | 'guide' | 'knowledge'>('atlas');
  const [loading, setLoading] = useState(true); const [connected, setConnected] = useState(false);
  const [error, setError] = useState(''); const [toast, setToast] = useState(''); const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false); const [showConnection, setShowConnection] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Route | null>(null);
  const selected = routes.find((r) => r.id === selectedId) || null;
  const reload = useCallback(async () => {
    try { const [r, j, p] = await Promise.all([api.routes(), api.jobs(), api.plans()]); setRoutes(r.routes); setJobs(j.jobs); setPlans(p.plans); setConnected(true); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível conectar ao seu ateliê.'); setConnected(false); return false; }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!jobs.some((j) => j.status === 'queued' || j.status === 'rendering')) return;
    const timer = setInterval(() => { api.jobs().then((r) => setJobs(r.jobs)).catch((e) => setError(e.message)); }, 2500);
    return () => clearInterval(timer);
  }, [jobs]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  async function createDemo() {
    setBusy(true); setError('');
    try {
      const route = await api.createRoute({ name: 'Vale sereno', description: 'Uma pequena viagem para conhecer o ateliê. Este percurso e o cenário são ilustrativos.', sourceName: 'Demonstração original Slow View TV — sem localização real verificada', transport: 'train', isDemo: true, points: demoPoints() });
      await api.createVariant(route.id, { ...initialVariant, name: 'Um amanhecer tranquilo', durationMinutes: 15 });
      await reload(); setSelectedId(route.id); setToast('Demonstração criada. Explore as atmosferas da viagem.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function importRoute(input: RouteInput) {
    const r = await api.createRoute(input);
    if (importPlan) { try { await api.deletePlan(importPlan.id); } catch { /* A saved route remains available even if the old planning card cannot be removed. */ } }
    await reload(); setSelectedId(r.id); setTab('routes'); setShowImport(false); setImportPlan(null); setToast('Sua rota está salva. Vamos criar a primeira atmosfera?');
  }
  async function deleteRoute() {
    if (!confirmDelete) return;
    setBusy(true);
    try { await api.deleteRoute(confirmDelete.id); if (selectedId === confirmDelete.id) setSelectedId(null); setConfirmDelete(null); await reload(); setToast('Rota excluída.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const activeJobs = jobs.filter((j) => j.status === 'queued' || j.status === 'rendering').length;
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand-link" href="#" onClick={(e) => { e.preventDefault(); setTab('routes'); setSelectedId(null); }} aria-label="Slow View TV início"><Brand /></a>
      <div className="sidebar-caption">SEU ESPAÇO CRIATIVO</div>
      <nav aria-label="Navegação principal">
        <button className={tab === 'atlas' ? 'nav-item active' : 'nav-item'} onClick={() => { setTab('atlas'); setSelectedId(null); }}><Globe2 size={19} />Explorar mundo</button>
        <button className={tab === 'routes' ? 'nav-item active' : 'nav-item'} onClick={() => { setTab('routes'); setSelectedId(null); }}><FolderHeart size={19} />Minhas rotas<span className="nav-count">{routes.length}</span></button>
        <button className={tab === 'jobs' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('jobs')}><Film size={19} />Produções{activeJobs > 0 && <span className="nav-count">{activeJobs}</span>}</button>
        <button className={tab === 'knowledge' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('knowledge')}><BookOpen size={19} />Fontes e plano</button>
        <button className={tab === 'guide' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('guide')}><Compass size={19} />Como funciona</button>
      </nav>
      <div className="sidebar-bottom"><div className="quiet-note"><Waves size={24} strokeWidth={1.3} /><p>O mundo tem seu ritmo.<br /><em>Encontre o seu.</em></p></div>
      <button className="connection" onClick={() => setShowConnection(true)}><span className={`status-dot ${connected ? '' : 'offline'}`} />{connected ? 'Ateliê conectado' : 'Conectar ao ateliê'}<Settings2 size={15} /></button></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span className="breadcrumb">Seu ateliê <span>/</span> {tab === 'atlas' ? 'Explorar mundo' : tab === 'jobs' ? 'Produções' : tab === 'guide' ? 'Como funciona' : tab === 'knowledge' ? 'Fontes e plano' : selected ? selected.name : 'Minhas rotas'}</span><div className="topbar-right"><span className="version-badge">ATLAS · EDIÇÃO 02</span><button className="icon-button help-button" aria-label="Como funciona" onClick={() => setTab('guide')}><CircleHelp size={20} /></button><button className="icon-button" aria-label="Conexão com o ateliê" onClick={() => setShowConnection(true)}><Settings2 size={18} /></button><button className="icon-button logout-button" aria-label="Sair do ateliê" title="Sair do ateliê" onClick={() => { void api.logout().catch((e) => setError(e.message)); }}><LogOut size={18} /></button><div className="profile-avatar" title="Slow View TV">SVTV</div></div></header>
      <main>
        {error && <div className="alert error" role="alert"><span>{error}</span><button className="text-button" onClick={() => { setError(''); void reload(); }}>Tentar novamente</button><button className="icon-button" aria-label="Fechar erro" onClick={() => setError('')}><X size={17} /></button></div>}
        {loading ? <div className="loading-state"><LoaderCircle className="spin" size={25} /><p>Abrindo seu ateliê…</p></div> : tab === 'atlas' ? <WorldRailMap routes={routes.filter(r => r.transport === 'train')} plans={plans.filter(p => p.transport === 'train')} onOpenRoute={(route) => { setSelectedId(route.id); setTab('routes'); }} onPlan={() => setShowPlan(true)} onImportGPX={() => { setImportPlan(null); setShowImport(true); }} onImported={async (route) => { await reload(); setSelectedId(route.id); setTab('routes'); setToast('Traçado ferroviário salvo no catálogo.'); }} /> : tab === 'knowledge' ? <KnowledgeTab /> : tab === 'guide' ? <Guide /> : tab === 'jobs' ? <Productions jobs={jobs} onRefresh={reload} onError={setError} /> : selected ?
          <RouteEditor key={selected.id} route={selected} jobs={jobs} onBack={() => setSelectedId(null)} onRefresh={reload} onToast={setToast} onError={setError} onJobs={() => setTab('jobs')} onDelete={() => setConfirmDelete(selected)} /> : <>
          <div className="page-title"><div><div className="eyebrow">VIAGENS FEITAS PARA DESACELERAR</div><h1>Um caminho. Muitas atmosferas.</h1><p>Guarde suas rotas e transforme cada uma em uma nova viagem.</p></div><div className="title-actions"><button className="button secondary" onClick={() => setShowPlan(true)} disabled={!connected}><Compass size={16} />Planejar rota</button><button className="button primary" onClick={() => { setImportPlan(null); setShowImport(true); }} disabled={!connected}><Plus size={18} />Nova rota</button></div></div>
          {plans.length > 0 && <section className="planned-section"><div className="section-heading"><h2>Viagens em preparação <span className="count-pill">{plans.length}</span></h2><span>Primeiro o destino. Depois, o traçado.</span></div>{plans.map((plan) => <article className="planned-card" key={plan.id}><div className="planned-symbol"><TrainFront size={24} strokeWidth={1.4} /></div><div className="planned-copy"><span className="eyebrow">AGUARDANDO TRAÇADO VERIFICADO</span><h3>{plan.name}</h3><p>{plan.origin} → {plan.destination} <span>·</span> {transportLabels[plan.transport]}</p>{plan.notes && <small>{plan.notes}</small>}</div><button className="button secondary" onClick={() => { setImportPlan(plan); setShowImport(true); }}><Upload size={15} />Adicionar percurso GPX</button><button className="icon-button" aria-label={`Excluir planejamento ${plan.name}`} onClick={async () => { if (!window.confirm(`Excluir o planejamento “${plan.name}”?`)) return; try { await api.deletePlan(plan.id); await reload(); } catch (e) { setError((e as Error).message); } }}><Trash2 size={15} /></button></article>)}</section>}
          {routes.length === 0 ? <section className="welcome-card"><div className="welcome-copy"><span className="pill"><Sprout size={14} />Um começo tranquilo</span><h2>Sua próxima viagem<br />começa aqui.</h2><p>Traga o percurso de um lugar real.<br />Depois, escolha a luz, a estação e o tempo.</p><button className="button primary" onClick={() => setShowImport(true)} disabled={!connected}><Upload size={17} />Importar minha primeira rota<ArrowRight size={16} /></button><button className="text-button demo-link" onClick={() => void createDemo()} disabled={busy || !connected}>{busy ? <LoaderCircle className="spin" size={15} /> : <Play size={14} />}Ou explorar uma demonstração</button></div><div className="welcome-art"><RouteArt /><span className="art-label"><MapPin size={13} />Um cenário para imaginar</span></div></section> : <div className="route-grid">
            {routes.map((r) => <article className="route-card" key={r.id}><button className="route-card-main" onClick={() => setSelectedId(r.id)}><div className={`route-card-map ${r.isDemo ? 'demo-map' : ''}`}><RouteMap route={r} progress={.45} /><span className="route-transport"><TrainFront size={13} />{transportLabels[r.transport]}</span>{r.isDemo && <span className="demo-badge">DEMONSTRAÇÃO</span>}</div><div className="route-card-body"><h3>{r.name}<ArrowRight size={18} /></h3><p>{r.description || 'Um percurso, novas possibilidades.'}</p><div className="route-meta"><span>{r.distanceKm.toFixed(1)} km</span><span>·</span><span>{r.variants.length} {r.variants.length === 1 ? 'atmosfera' : 'atmosferas'}</span></div></div></button><button className="card-delete icon-button" onClick={() => setConfirmDelete(r)} aria-label={`Excluir rota ${r.name}`}><Trash2 size={15} /></button></article>)}
            <button className="add-route-card" onClick={() => setShowImport(true)}><span><Plus size={25} /></span><strong>Um novo caminho</strong><p>Importe outra rota para sua coleção</p></button>
          </div>}
          <div className="section-heading"><h2>Da rota à sua próxima produção</h2><span>No seu tempo, em quatro passos</span></div>
          <div className="steps-grid">{[{ icon: RouteIcon, title: 'Escolha o caminho', text: 'Importe um GPX com o traçado do percurso.' }, { icon: Sun, title: 'Encontre a atmosfera', text: 'Combine estação, horário e condições do tempo.' }, { icon: Mountain, title: 'Veja a viagem nascer', text: 'Explore o trajeto em uma prévia 3D ilustrativa.' }, { icon: Film, title: 'Leve para a tela', text: 'Exporte um teste ou renderize sua versão em MP4.' }].map(({ icon: Icon, title, text }, i) => <div className="step-card" key={title}><div className="step-icon"><Icon size={21} strokeWidth={1.5} /></div><span className="step-number">0{i + 1}</span><h3>{title}</h3><p>{text}</p></div>)}</div>
          <div className="honesty-note"><ShieldCheck size={18} /><p><strong>Um percurso real merece cuidado.</strong> A prévia respeita as coordenadas importadas. Vegetação e paisagem são ilustrativas nesta edição; ainda não reproduzem o local com fidelidade fotográfica.</p></div>
        </>}
      </main>
      <footer className="app-footer"><Brand compact /><span>Quiet journeys. No talking.</span><span>Feito para ir com calma.</span></footer>
    </div>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}<button className="icon-button" aria-label="Fechar aviso" onClick={() => setToast('')}><X size={15} /></button></div>}
    {showImport && <ImportModal plan={importPlan} onClose={() => { setShowImport(false); setImportPlan(null); }} onImport={importRoute} />}
    {showPlan && <PlanModal onClose={() => setShowPlan(false)} onSave={async (input) => { await api.createPlan(input); await reload(); setShowPlan(false); setToast('Planejamento salvo. O percurso será adicionado quando você tiver o GPX.'); }} />}
    {showConnection && <ConnectionModal onClose={() => setShowConnection(false)} onConnect={async () => { setError(''); if (await reload()) setShowConnection(false); }} />}
    {confirmDelete && <Modal title="Excluir esta rota?" subtitle={`“${confirmDelete.name}” e suas atmosferas serão removidas. As produções já concluídas permanecerão no histórico.`} onClose={() => setConfirmDelete(null)}><div className="modal-actions"><button className="button secondary" onClick={() => setConfirmDelete(null)}>Manter rota</button><button className="button danger" disabled={busy} onClick={() => void deleteRoute()}><Trash2 size={16} />Excluir rota</button></div></Modal>}
  </div>;
}

function RouteEditor({ route, jobs, onBack, onRefresh, onToast, onError, onJobs, onDelete }: { route: Route; jobs: Job[]; onBack: () => void; onRefresh: () => Promise<unknown>; onToast: (s: string) => void; onError: (s: string) => void; onJobs: () => void; onDelete: () => void }) {
  const [draft, setDraft] = useState<VariantInput>({ ...initialVariant, durationMinutes: Math.max(1, Math.min(720, Math.round(route.distanceKm / (route.transport === 'walk' ? 4 : route.transport === 'car' ? 40 : 60) * 60))) });
  const [activeId, setActiveId] = useState<string | null>(route.variants[0]?.id || null);
  const [progress, setProgress] = useState(0); const [playing, setPlaying] = useState(false); const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false); const [confirmFull, setConfirmFull] = useState(false);
  const [resolution, setResolution] = useState<VideoResolution>('2160p');
  const active = route.variants.find((v) => v.id === activeId);
  const [savedDraft, setSavedDraft] = useState<string>('');
  const effective = { ...draft, id: activeId || 'draft', routeId: route.id, createdAt: active?.createdAt || '' } as Variant;
  const dirty = JSON.stringify(draft) !== savedDraft;
  useEffect(() => {
    if (active) {
      const { name, season, timeOfDay, weather, durationMinutes, temperatureC, showMap } = active;
      const next = { name, season, timeOfDay, weather, durationMinutes, temperatureC, showMap };
      setDraft(next); setSavedDraft(JSON.stringify(next));
    }
  }, [activeId]); // Keep local edits when polling refreshes route data.
  useEffect(() => {
    if (!playing) return;
    let id = 0; let last = performance.now();
    function frame(now: number) { const elapsed = Math.min(now - last, 100); last = now; setProgress((p) => { const next = p + elapsed / 60000; if (next >= 1) { setPlaying(false); return 1; } return next; }); id = requestAnimationFrame(frame); }
    id = requestAnimationFrame(frame); return () => cancelAnimationFrame(id);
  }, [playing]);
  function update<K extends keyof VariantInput>(key: K, value: VariantInput[K]) { setDraft((d) => ({ ...d, [key]: value })); }
  async function save(): Promise<string | undefined> {
    if (!draft.name.trim()) { onError('Dê um nome para esta atmosfera antes de salvar.'); return; }
    if (!Number.isFinite(draft.durationMinutes) || draft.durationMinutes < 1 || draft.durationMinutes > 720) { onError('Escolha uma duração entre 1 minuto e 12 horas.'); return; }
    setBusy(true);
    try { const v = await api.createVariant(route.id, draft); await onRefresh(); setSavedDraft(JSON.stringify(draft)); setActiveId(v.id); onToast('Atmosfera salva como uma nova versão.'); return v.id; }
    catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  async function render(preview: boolean) {
    setBusy(true);
    try {
      let id = activeId;
      if (dirty || !id) { const newId = await save(); if (!newId) return; id = newId; }
      await api.createJob(id, preview, preview ? '720p' : resolution); await onRefresh(); setConfirmFull(false); onToast(preview ? 'Teste de 8 segundos entrou na fila.' : 'Sua viagem entrou na fila de produção.'); onJobs();
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  return <>
    <button className="back-button" onClick={onBack}><ArrowLeft size={16} />Todas as rotas</button>
    <div className="page-title editor-title"><div><div className="eyebrow">{route.isDemo ? 'PERCURSO DE DEMONSTRAÇÃO' : 'SUA COLEÇÃO DE VIAGENS'}</div><h1>{route.name}</h1><p><span>{transportLabels[route.transport]}</span><span className="dot-separator">·</span>{route.distanceKm.toFixed(1)} km<span className="dot-separator">·</span>{route.points.length.toLocaleString('pt-BR')} pontos de percurso</p></div><button className="icon-button delete-route" onClick={onDelete} aria-label="Excluir rota"><Trash2 size={18} /></button></div>
    <div className="editor-layout"><div className="editor-main"><section className="scene-card"><div className="scene-topline"><span><span className="status-dot" />PRÉVIA DA VIAGEM</span><span>Cenário 3D ilustrativo</span></div><div className="scene-viewport">
      <JourneyScene route={route} variant={effective} progress={progress} onReady={() => setReady(true)} />
      <div className="scene-overlay-top"><span className="scene-tag">{seasonLabels[draft.season]} · {timeLabels[draft.timeOfDay]}</span>{draft.temperatureC !== null && <span className="scene-tag">{draft.temperatureC}°C · simulado</span>}</div>
      <div className="scene-wordmark">Slow View TV<span>Quiet journeys. No talking.</span></div>
      {draft.showMap && <div className="preview-map"><span>Seu caminho · {Math.round(progress * 100)}%</span><RouteMap route={route} progress={progress} compact /></div>}
      {!ready && <div className="scene-loading"><LoaderCircle className="spin" size={24} />Preparando paisagem…</div>}
    </div><div className="playback"><button className="play-button" aria-label={playing ? 'Pausar prévia' : 'Reproduzir prévia'} disabled={!ready} onClick={() => { if (progress >= 1) setProgress(0); setPlaying(!playing); }}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button><input aria-label="Posição no percurso" type="range" min="0" max="1" step="0.001" value={progress} onChange={(e) => setProgress(Number(e.target.value))} /><span>{Math.round(progress * 100)}%</span><small>Exploração acelerada</small></div></section>
      <div className="source-note"><MapPin size={17} /><div><strong>{route.isDemo ? 'Este traçado é uma demonstração' : 'Percurso importado do seu GPX'}</strong><p>{route.isDemo ? 'Para produzir uma viagem baseada em um lugar real, importe o GPX desse percurso.' : `Fonte: ${route.sourceName}. ${route.elevationKnown ? 'Elevação disponível no arquivo.' : 'Sem elevação completa: altura simplificada na prévia.'}`}</p></div></div>
      <section className="saved-atmospheres"><div className="section-heading"><h2>Atmosferas desta rota <span className="count-pill">{route.variants.length}</span></h2><button className="text-button" onClick={() => { setActiveId(null); setDraft({ ...draft, name: '' }); setSavedDraft(''); }}><Plus size={15} />Nova atmosfera</button></div>
        {!route.variants.length ? <div className="empty-inline"><Sunrise size={25} /><p>A primeira atmosfera está esperando por você.<br /><small>Escolha as condições ao lado e salve uma versão.</small></p></div> : <div className="atmosphere-list">{route.variants.map((v) => {
          const Icon = seasonIcons[v.season]; const hasJob = jobs.some((j) => j.variantId === v.id && ['queued', 'rendering'].includes(j.status));
          return <div className={`atmosphere-item ${activeId === v.id ? 'selected' : ''}`} key={v.id}><button className="atmosphere-select" onClick={() => setActiveId(v.id)}><span className={`atmosphere-icon ${v.season}`}><Icon size={20} /></span><span><strong>{v.name}</strong><small>{seasonLabels[v.season]} · {timeLabels[v.timeOfDay]} · {weatherLabels[v.weather]} · {formatDuration(v.durationMinutes)}</small></span>{activeId === v.id && <Check size={17} />}</button><button className="icon-button" aria-label={`Excluir atmosfera ${v.name}`} disabled={hasJob} onClick={async () => { if (!window.confirm(`Excluir a atmosfera “${v.name}”? As produções concluídas permanecem no histórico.`)) return; try { await api.deleteVariant(v.id); if (activeId === v.id) { setActiveId(null); setSavedDraft(''); } await onRefresh(); onToast('Atmosfera excluída.'); } catch (e) { onError((e as Error).message); } }}><Trash2 size={14} /></button></div>;
        })}</div>}
      </section>
    </div><aside className="atmosphere-panel"><div className="panel-header"><Settings2 size={19} /><h2>Crie a atmosfera</h2></div><p className="panel-description">O mesmo caminho, uma nova sensação.</p>
      <label className="field-label" htmlFor="atmosphere-name">Nome da versão</label><input id="atmosphere-name" maxLength={120} value={draft.name} onChange={(e) => update('name', e.target.value)} placeholder="Ex.: Inverno ao amanhecer" />
      <ChoiceGroup label="Estação do ano" values={['spring', 'summer', 'autumn', 'winter'] as Season[]} value={draft.season} labels={seasonLabels} icons={seasonIcons} onChange={(v) => update('season', v)} />
      <ChoiceGroup label="Horário" values={['dawn', 'day', 'dusk', 'night'] as TimeOfDay[]} value={draft.timeOfDay} labels={timeLabels} icons={timeIcons} onChange={(v) => update('timeOfDay', v)} />
      <ChoiceGroup label="Condições do tempo" values={['clear', 'cloudy', 'rain', 'snow'] as Weather[]} value={draft.weather} labels={weatherLabels} icons={weatherIcons} onChange={(v) => update('weather', v)} />
      <div className="field-row"><div><label className="field-label" htmlFor="duration">Duração (min)</label><input id="duration" type="number" min="1" max="720" step="1" value={draft.durationMinutes} onChange={(e) => update('durationMinutes', Number(e.target.value))} /></div><div><label className="field-label" htmlFor="temperature">Temperatura (°C)</label><input id="temperature" type="number" min="-60" max="60" step="1" value={draft.temperatureC ?? ''} placeholder="Ocultar" onChange={(e) => update('temperatureC', e.target.value === '' ? null : Number(e.target.value))} /></div></div>
      <p className="field-hint">Horário, clima e temperatura são simulados.</p>
      <label className="toggle-row"><span><Map size={17} />Mapa na tela</span><input type="checkbox" checked={draft.showMap} onChange={(e) => update('showMap', e.target.checked)} /><span className="toggle" /></label>
      <label className="field-label" htmlFor="resolution">Resolução do vídeo completo</label><select id="resolution" value={resolution} onChange={(e) => setResolution(e.target.value as VideoResolution)}><option value="2160p">4K UHD · 3840 × 2160</option><option value="1080p">Full HD · 1920 × 1080</option><option value="720p">HD · 1280 × 720</option></select><p className="field-hint">A duração acompanha o percurso inteiro. Testes rápidos usam 720p.</p><div className="panel-divider" /><button className="button primary full-width" disabled={busy || !draft.name.trim()} onClick={() => void save()}>{busy ? <LoaderCircle className="spin" size={16} /> : activeId ? <Copy size={16} /> : <Plus size={16} />}{activeId ? 'Salvar como nova versão' : 'Salvar atmosfera'}</button>
      <button className="button secondary full-width" disabled={busy || !draft.name.trim()} onClick={() => void render(true)}><Film size={16} />Gerar teste de 8 segundos</button>
      <button className="text-button full-render" disabled={busy || !draft.name.trim()} onClick={() => setConfirmFull(true)}>Renderizar viagem completa<ArrowRight size={14} /></button>
      <div className="render-footnote"><Leaf size={15} /><p>Comece com um teste curto. A versão completa pode levar bastante tempo para renderizar.</p></div>
    </aside></div>
    {confirmFull && <Modal title="Produzir a viagem completa?" subtitle={`${formatDuration(draft.durationMinutes)} de vídeo em ${resolution === '2160p' ? '4K UHD' : resolution}, 24 quadros por segundo.`} onClose={() => setConfirmFull(false)}><div className="modal-notice"><Film size={21} /><p>A renderização usa o computador do servidor e pode demorar mais que a duração do vídeo. Esta edição exporta um cenário ilustrativo, sem áudio. Faça primeiro um teste curto para conferir o resultado.</p></div><div className="modal-actions"><button className="button secondary" onClick={() => setConfirmFull(false)}>Voltar</button><button className="button primary" disabled={busy} onClick={() => void render(false)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Film size={16} />}Produzir vídeo</button></div></Modal>}
  </>;
}

function ChoiceGroup<T extends string>({ label, values, value, labels, icons, onChange }: { label: string; values: T[]; value: T; labels: Record<T, string>; icons: Record<T, typeof Sun>; onChange: (value: T) => void }) {
  return <fieldset className="choice-field"><legend>{label}</legend><div className="choice-grid">{values.map((v) => { const Icon: typeof Sun = icons[v]; return <button type="button" key={v} className={`choice ${value === v ? 'chosen' : ''}`} aria-pressed={value === v} onClick={() => onChange(v)}><Icon size={18} strokeWidth={1.6} />{labels[v]}</button>; })}</div></fieldset>;
}

function Productions({ jobs, onRefresh, onError }: { jobs: Job[]; onRefresh: () => Promise<unknown>; onError: (s: string) => void }) {
  const [watching, setWatching] = useState<{ title: string; url: string } | null>(null);
  const labels: Record<Job['status'], string> = { queued: 'Na fila', rendering: 'Renderizando', completed: 'Concluído', failed: 'Não concluído', cancelled: 'Cancelado' };
  return <><div className="page-title"><div><div className="eyebrow">DO SEU ATELIÊ PARA O MUNDO</div><h1>Suas produções</h1><p>Acompanhe cada viagem, do primeiro quadro ao arquivo final.</p></div><button className="button secondary" onClick={() => void onRefresh()}>Atualizar</button></div>
    {watching && <section className="production-player"><div className="production-player-header"><strong>{watching.title}</strong><button className="icon-button" aria-label="Fechar vídeo" onClick={() => setWatching(null)}><X size={17} /></button></div><video key={watching.url} src={watching.url} poster={watching.url.startsWith('/demos/') ? '/demos/slowvista-4k-poster.png' : undefined} controls playsInline preload="metadata" aria-label={watching.title} /><p className="production-player-note">Viagem virtual. O vídeo pode ser reproduzido aqui ou baixado no botão da produção.</p></section>}
    {jobs.length === 0 ? <div className="empty-productions"><span><Film size={35} strokeWidth={1.2} /></span><h2>Há uma viagem esperando para nascer.</h2><p>Abra uma rota, salve uma atmosfera e gere seu primeiro teste.</p><button className="text-button" onClick={() => setWatching({ title: 'Teste técnico 4K · maquete ilustrativa · 2 segundos', url: '/demos/slowvista-4k-test.mp4' })}><Play size={14} />Assistir à demonstração 4K</button></div> : <div className="jobs-list">{jobs.map((job) => <article className="job-card" key={job.id}><div className="job-icon">{job.status === 'rendering' ? <LoaderCircle className="spin" size={25} /> : <Film size={25} strokeWidth={1.3} />}</div><div className="job-body"><div className="job-heading"><h3>{job.variantName}</h3><span className={`job-status ${job.status}`}>{labels[job.status]}</span></div><p>{job.routeName} <span>·</span> {job.preview ? `Teste de ${job.outputSeconds} segundos` : formatDuration(job.outputSeconds / 60)} <span>·</span> {job.resolution === '2160p' ? '4K UHD' : job.resolution || '720p'} <span>·</span> {new Date(job.createdAt).toLocaleDateString('pt-BR')}</p>{['queued', 'rendering'].includes(job.status) && <div className="job-progress"><progress max="1" value={job.progress} /><span>{Math.floor(job.progress * 100)}%</span></div>}{job.error && <p className="job-error">{job.error}</p>}</div><div className="job-actions">{job.status === 'completed' && <button className="text-button job-watch" onClick={async () => { try { const fresh = await api.job(job.id); if (fresh.downloadUrl) setWatching({ title: `${job.routeName} · ${job.variantName}`, url: `${apiBase}${fresh.downloadUrl}${fresh.downloadUrl.includes('?') ? '&' : '?'}inline=1` }); } catch (e) { onError((e as Error).message); } }}><Play size={14} />Assistir</button>}{job.status === 'completed' && job.downloadUrl && <button className="button secondary" onClick={async () => { try { const fresh = await api.job(job.id); if (fresh.downloadUrl) { const link = document.createElement('a'); link.href = `${apiBase}${fresh.downloadUrl}`; link.download = ''; link.click(); } } catch (e) { onError((e as Error).message); } }}><ArrowDownToLine size={16} />Baixar MP4</button>}{['queued', 'rendering'].includes(job.status) && <button className="text-button" onClick={async () => { try { await api.cancelJob(job.id); await onRefresh(); } catch (e) { onError((e as Error).message); } }}>Cancelar</button>}</div></article>)}</div>}
    <div className="honesty-note"><Film size={18} /><p>Exportação MP4 em 720p, Full HD ou 4K UHD nativo, a 24 fps, sem áudio nesta edição. O arquivo inclui a identificação de viagem virtual e temperatura simulada quando exibida.</p></div></>;
}

function Guide() {
  return <div className="guide"><div className="eyebrow">UM PASSO DE CADA VEZ</div><h1>Como sua viagem ganha vida</h1><p className="guide-lead">Você guarda o caminho uma vez. Depois, cria diferentes maneiras de percorrê-lo.</p>
    {[['01', 'Traga o percurso real', 'Importe um GPX de uma viagem com um único segmento contínuo. Ele traz as coordenadas e, quando disponível, a elevação. O traçado precisa seguir a estrada, ferrovia ou trilha de verdade; pontos distantes entre si não descrevem todas as curvas.'], ['02', 'Crie e guarde atmosferas', 'Escolha estação do ano, horário, clima, duração e temperatura opcional. Cada combinação é salva como uma versão independente da rota. Você pode voltar a ela depois de fechar o navegador.'], ['03', 'Confira a prévia', 'Explore o percurso com o controle de posição. Nesta primeira edição, o trajeto vem do GPX, mas relevo ao redor, árvores e construções são ilustrativos. Não é uma reconstrução fotográfica do local.'], ['04', 'Exporte um teste e depois a viagem', 'Gere primeiro oito segundos de MP4. A produção completa aceita de um minuto a doze horas, percorre a rota uma vez e é feita quadro a quadro no servidor. Uma viagem longa pode levar horas para renderizar; o limite aceito não garante esse tempo de processamento.'], ['05', 'Publique no seu ritmo', 'Você pode enviar o MP4 ao YouTube ou usá-lo como fonte de mídia no OBS. Apresente a produção como viagem virtual. Antes de publicar, confira a imagem, inclua áudio com direitos adequados e revise a experiência completa.']].map(([number, title, description]) => <section className="guide-step" key={number}><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></section>)}
    <div className="guide-roadmap"><Mountain size={26} /><h2>O próximo salto é a fidelidade do cenário.</h2><p>Para representar fielmente cada lugar, a próxima etapa exige dados reais de terreno, edifícios, vegetação e referências visuais licenciadas. Nenhuma IA ou serviço pago está conectado nesta edição.</p></div>
  </div>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input,button,select,textarea'); first?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,textarea,a[href]') || []);
      const firstItem = items[0]; const lastItem = items.at(-1);
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem?.focus(); }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem?.focus(); }
    }
    document.addEventListener('keydown', keydown); const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title}><button className="modal-close icon-button" onClick={onClose} aria-label="Fechar janela"><X size={20} /></button><div className="modal-symbol"><RouteIcon size={24} strokeWidth={1.4} /></div><h2>{title}</h2>{subtitle && <p className="modal-subtitle">{subtitle}</p>}{children}</div></div>;
}

function ImportModal({ onClose, onImport, plan }: { onClose: () => void; onImport: (input: RouteInput) => Promise<void>; plan: RoutePlan | null }) {
  const [input, setInput] = useState<RouteInput>({ name: plan?.name || '', description: plan?.notes || '', sourceName: '', transport: plan?.transport || 'train', isDemo: false, points: [] });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const fileRef = useRef<HTMLInputElement>(null);
  async function readFile(file?: File) {
    if (!file) return;
    setError('');
    try {
      if (file.size > 12_000_000) throw new Error('O arquivo pode ter até 12 MB.');
      const result = parseGPX(await file.text());
      setInput((s) => ({ ...s, points: result.points, sourceName: file.name, name: s.name || result.name || file.name.replace(/\.gpx$/i, '') }));
    } catch (e) { setError((e as Error).message); setInput((s) => ({ ...s, points: [], sourceName: '' })); }
  }
  return <Modal title="Um novo caminho" subtitle="Importe o traçado real da sua próxima viagem." onClose={onClose}><form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); try { await onImport(input); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>
    <input ref={fileRef} className="visually-hidden" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" onChange={(e) => void readFile(e.target.files?.[0])} />
    <button type="button" className={`file-drop ${input.points.length ? 'file-ready' : ''}`} onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void readFile(e.dataTransfer.files[0]); }}>{input.points.length ? <Check size={25} /> : <Upload size={25} />}<strong>{input.sourceName || 'Escolher arquivo GPX'}</strong><span>{input.points.length ? `${input.points.length.toLocaleString('pt-BR')} pontos · clique para trocar` : 'ou arraste aqui · até 12 MB · um percurso contínuo'}</span></button>
    <label className="field-label" htmlFor="route-name">Nome da rota</label><input id="route-name" required maxLength={120} value={input.name} onChange={(e) => setInput((s) => ({ ...s, name: e.target.value }))} placeholder="Ex.: Uma manhã pela Serra do Mar" />
    <label className="field-label" htmlFor="transport">Como vamos viajar?</label><div className="select-wrap"><select id="transport" value={input.transport} onChange={(e) => setInput((s) => ({ ...s, transport: e.target.value as RouteInput['transport'] }))}><option value="train">De trem</option><option value="car">De carro</option><option value="walk">Caminhando</option></select><ChevronDown size={16} /></div>
    <label className="field-label" htmlFor="route-description">Uma breve descrição <span>(opcional)</span></label><textarea id="route-description" maxLength={1000} rows={2} value={input.description} onChange={(e) => setInput((s) => ({ ...s, description: e.target.value }))} placeholder="O que torna esse caminho especial?" />
    <p className="field-hint">O GPX define o percurso. A paisagem ao redor ainda será ilustrativa. Use um arquivo que você tenha direito de utilizar.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Voltar</button><button className="button primary" disabled={busy || !input.points.length || !input.name.trim()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}Salvar minha rota</button></div>
  </form></Modal>;
}

function ConnectionModal({ onClose }: { onClose: () => void; onConnect: () => Promise<void> }) {
  return <Modal title="Conexão com seu ateliê" subtitle="Sua sessão está protegida pelo acesso do painel." onClose={onClose}><p className="field-hint">As rotas, fontes e notas ficam no banco de dados do servidor. Sua sessão termina ao sair ou após o prazo de acesso.</p><div className="modal-actions"><button className="button primary" onClick={onClose}>Fechar</button></div></Modal>;
}

function PlanModal({ onClose, onSave }: { onClose: () => void; onSave: (input: RoutePlanInput) => Promise<void> }) {
  const [input, setInput] = useState<RoutePlanInput>({ name: '', origin: '', destination: '', transport: 'train', notes: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <Modal title="Qual é o próximo destino?" subtitle="Guarde sua ideia agora. Você adiciona o percurso verificado depois." onClose={onClose}><form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); try { await onSave({ ...input, name: input.name.trim() || `${input.origin.trim()} → ${input.destination.trim()}` }); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>
    <div className="field-row"><div><label className="field-label" htmlFor="plan-origin">Origem</label><input id="plan-origin" required maxLength={120} value={input.origin} onChange={(e) => setInput({ ...input, origin: e.target.value })} placeholder="Ex.: Viena" /></div><div><label className="field-label" htmlFor="plan-destination">Destino</label><input id="plan-destination" required maxLength={120} value={input.destination} onChange={(e) => setInput({ ...input, destination: e.target.value })} placeholder="Ex.: Praga" /></div></div>
    <label className="field-label" htmlFor="plan-name">Nome da viagem <span>(opcional)</span></label><input id="plan-name" maxLength={120} value={input.name} onChange={(e) => setInput({ ...input, name: e.target.value })} placeholder="Origem → destino" />
    <label className="field-label" htmlFor="plan-transport">Como vamos viajar?</label><select id="plan-transport" value={input.transport} onChange={(e) => setInput({ ...input, transport: e.target.value as RoutePlan['transport'] })}><option value="train">De trem</option><option value="car">De carro</option><option value="walk">Caminhando</option></select>
    <label className="field-label" htmlFor="plan-notes">Anotações <span>(opcional)</span></label><textarea id="plan-notes" maxLength={1000} rows={3} value={input.notes} onChange={(e) => setInput({ ...input, notes: e.target.value })} placeholder="Estações, referências e ideias para esta viagem" />
    <p className="field-hint">O planejamento guarda sua intenção. Ele ainda não contém coordenadas e não pode ser renderizado até receber o traçado.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Voltar</button><button className="button primary" disabled={busy || !input.origin.trim() || !input.destination.trim()}>{busy ? <LoaderCircle className="spin" size={15} /> : <Compass size={15} />}Guardar planejamento</button></div>
  </form></Modal>;
}
