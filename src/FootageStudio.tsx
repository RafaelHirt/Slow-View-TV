import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Check, Download, Film, Headphones, Library, LogOut, Plus, Scissors, Search, TrainFront, Upload, X } from 'lucide-react';
import { api } from './api';
import { footageApi, mediaUrl, type FootageAsset, type FootageEdit, type FootageExport, type MediaMetadata, type StockVideo } from './footage-api';
import { TrainLibrary } from './TrainLibrary';
import './footage.css';

const licenses: Record<string, string> = { own: 'Filmagem ou áudio próprio', cc0: 'CC0 / domínio público', pexels: 'Licença Pexels', pixabay: 'Licença Pixabay', permission: 'Autorização do titular', 'cc-by-sa-3.0': 'CC BY-SA 3.0', 'cc-by-sa-3.0-no': 'CC BY-SA 3.0 Noruega' };
const blankMetadata: MediaMetadata = { title: '', license: 'own', sourceUrl: '', attribution: '', licenseNotes: '', rightsConfirmed: false };
const time = (value = 0) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
const statuses: Record<FootageExport['status'], string> = { queued: 'Na fila', editing: 'Editando', completed: 'Pronto para assistir', failed: 'Não concluído', cancelled: 'Cancelado' };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir esta ação.';
const sampleVideo: StockVideo = {
  id: '3563086', title: 'Trem na neve · amostra de Himachal Pradesh', author: 'shalender kumar / Pexels',
  sourceUrl: 'https://www.pexels.com/video/a-train-travelling-through-the-railroad-in-the-snowy-mountain-of-himachal-in-india-3563086/',
  fileUrl: 'https://videos.pexels.com/video-files/3563086/3563086-hd_1280_720_25fps.mp4',
  duration: 25.92, width: 1280, height: 720,
};

function MetadataFields({ value, onChange }: { value: MediaMetadata; onChange: (value: MediaMetadata) => void }) {
  const set = (key: keyof MediaMetadata, next: string | boolean) => onChange({ ...value, [key]: next });
  return <>
    <label>Nome do material<input value={value.title} onChange={e => set('title', e.target.value)} required maxLength={240} /></label>
    <div className="ft-fields"><label>Origem e licença<select value={value.license} onChange={e => set('license', e.target.value)}>{Object.entries(licenses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Página da fonte<input type="url" placeholder="https://…" value={value.sourceUrl} onChange={e => set('sourceUrl', e.target.value)} required={value.license !== 'own'} maxLength={2048} /></label></div>
    <label>Autor e créditos<input value={value.attribution} onChange={e => set('attribution', e.target.value)} placeholder="Nome do autor e texto de crédito" maxLength={1000} /></label>
    <label>Observações da licença<textarea rows={2} value={value.licenseNotes} onChange={e => set('licenseNotes', e.target.value)} placeholder="Condições de uso e referência da autorização, se houver" maxLength={2000} /></label>
    <label className="ft-check"><input type="checkbox" checked={value.rightsConfirmed} onChange={e => set('rightsConfirmed', e.target.checked)} />Conferi os direitos para editar e publicar este material.</label>
    <p className="ft-hint">Você pode guardar o material para avaliar. A exportação fica disponível depois de conferir a licença.</p>
  </>;
}

function ImportPanel({ seed, limit, onClose, onImported }: { seed?: StockVideo; limit: number; onClose: () => void; onImported: () => Promise<void> }) {
  const [metadata, setMetadata] = useState<MediaMetadata>(seed ? { ...blankMetadata, title: seed.title, license: 'pexels', sourceUrl: seed.sourceUrl, attribution: seed.author } : blankMetadata);
  const [mode, setMode] = useState<'file' | 'link'>(seed ? 'link' : 'file');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState(seed?.fileUrl || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (mode === 'file') {
        if (!file) throw new Error('Escolha um arquivo de vídeo ou áudio.');
        if (file.size > limit) throw new Error(`O limite deste servidor é ${Math.floor(limit / 1024 ** 2)} MB por arquivo.`);
        const asset = await footageApi.create(metadata);
        await footageApi.upload(asset.id, file);
      } else await footageApi.import({ ...metadata, fileUrl: url });
      await onImported(); onClose();
    } catch (err) { setError(errorMessage(err)); await onImported(); }
    finally { setBusy(false); }
  }
  return <section className="ft-panel ft-import" aria-labelledby="ft-import-title">
    <div className="ft-panel-title"><h2 id="ft-import-title">Adicionar material</h2><button type="button" className="ft-icon" onClick={onClose} disabled={busy} aria-label="Fechar importação"><X size={20} /></button></div>
    <form onSubmit={e => void submit(e)}>
      <fieldset disabled={busy}>
        <div className="ft-choice"><button type="button" aria-pressed={mode === 'file'} onClick={() => setMode('file')}>Enviar arquivo</button><button type="button" aria-pressed={mode === 'link'} onClick={() => setMode('link')}>Link direto da fonte</button></div>
        {mode === 'file' ? <label className="ft-upload"><Upload size={24} /><span>MP4 ou WebM · áudio MP3 ou WAV</span><small>Até {Math.floor(limit / 1024 ** 2)} MB por arquivo</small><input type="file" accept="video/mp4,video/webm,audio/mpeg,audio/wav,.wav" required onChange={e => { const next = e.target.files?.[0] || null; setFile(next); if (next && !metadata.title) setMetadata({ ...metadata, title: next.name.replace(/\.[^.]+$/, '') }); }} /></label>
          : <label>Link direto do arquivo<input type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://videos.pexels.com/…mp4" /><small>Arquivos de videos.pexels.com ou cdn.pixabay.com. Links de páginas e do YouTube servem como referência; não são arquivos importáveis.</small></label>}
        <MetadataFields value={metadata} onChange={setMetadata} />
        {error && <p className="ft-error" role="alert">{error}</p>}
        <button className="ft-button ft-primary" type="submit"><Upload size={17} />{busy ? 'Enviando material… mantenha esta página aberta' : 'Adicionar à biblioteca'}</button>
      </fieldset>
    </form>
  </section>;
}

function Editor({ asset, assets, onBack, onExport, onUpdate }: { asset: FootageAsset; assets: FootageAsset[]; onBack: () => void; onExport: (edit: FootageEdit) => Promise<void>; onUpdate: () => Promise<void> }) {
  const player = useRef<HTMLVideoElement>(null);
  const [metadata, setMetadata] = useState<MediaMetadata>(asset);
  const [editingSource, setEditingSource] = useState(false);
  const [title, setTitle] = useState(`${asset.title} · trecho`), [start, setStart] = useState(0), [end, setEnd] = useState(Math.min(60, asset.duration || 0));
  const [audioMode, setAudioMode] = useState<FootageEdit['audioMode']>(asset.hasAudio ? 'original' : 'silent'), [ambientId, setAmbientId] = useState('');
  const [resolution, setResolution] = useState('720p'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const formats = [{ key: '720p', width: 1280, height: 720, name: 'HD · 720p' }, { key: '1080p', width: 1920, height: 1080, name: 'Full HD · 1080p' }, { key: '2160p', width: 3840, height: 2160, name: '4K · 2160p' }];
  const audio = assets.filter(item => item.kind === 'audio' && item.status === 'ready' && item.rightsConfirmed);
  useEffect(() => { if (player.current) player.current.volume = .3; }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { player.current?.pause(); await onExport({ title, assetId: asset.id, ambientId: audioMode === 'ambient' ? ambientId : null, start, end, resolution, audioMode }); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function saveSource(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await footageApi.update(asset.id, metadata); await onUpdate(); setEditingSource(false); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <>
    <button className="ft-back" onClick={onBack}><ArrowLeft size={16} />Biblioteca</button>
    <div className="ft-heading"><div><p className="ft-eyebrow">UM TRECHO, NO SEU RITMO</p><h1>Escolha o que fica.</h1><p>Assista ao material antes de selecionar a edição.</p></div></div>
    <div className="ft-editor-grid">
      <div><section className="ft-panel ft-player-panel">
        <video ref={player} controls playsInline preload="metadata" src={mediaUrl(asset.fileUrl!)} aria-label={`Filmagem original: ${asset.title}`} onTimeUpdate={() => { if (player.current && player.current.currentTime >= end) player.current.pause(); }} />
        <div className="ft-player-caption"><strong>{asset.title}</strong><span>{time(asset.duration)} · {asset.width} × {asset.height}{asset.frameRate ? ` · ${Number(asset.frameRate.toFixed(2))} fps` : ''}{!asset.hasAudio ? ' · Sem áudio na fonte' : ''}</span></div>
        <p className="ft-hint">Esta é a fonte original. A entrada e a saída suaves e o áudio nivelado serão aplicados no MP4 exportado.</p>
      </section>
      <section className="ft-panel ft-source"><div className="ft-panel-title"><h2>Fonte e créditos</h2><button className="ft-text-button" onClick={() => setEditingSource(!editingSource)}>{editingSource ? 'Fechar' : 'Editar dados'}</button></div>
        {editingSource ? <form onSubmit={e => void saveSource(e)}><MetadataFields value={metadata} onChange={setMetadata} /><button className="ft-button" disabled={busy}>Salvar dados da fonte</button></form>
          : <><p>{licenses[asset.license]} · {asset.rightsConfirmed ? 'Licença conferida' : 'Licença pendente de conferência'}</p>{asset.attribution && <p>{asset.attribution}</p>}{asset.sourceUrl && <a href={asset.sourceUrl} target="_blank" rel="noreferrer">Abrir página da fonte <ArrowUpRight size={14} /></a>}{asset.licenseNotes && <p className="ft-hint">{asset.licenseNotes}</p>}</>}
      </section></div>
      <form className="ft-panel ft-edit-form" onSubmit={e => void submit(e)}><h2>Preparar a edição</h2>
        <label>Nome do vídeo<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={240} /></label>
        <div className="ft-fields"><label>Início (segundos)<input type="number" min="0" max={asset.duration} step="any" value={start} onChange={e => setStart(Number(e.target.value))} required /></label><label>Fim (segundos)<input type="number" min="3" max={asset.duration} step="any" value={end} onChange={e => setEnd(Number(e.target.value))} required /></label></div>
        <button type="button" className="ft-text-button" onClick={() => { if (player.current) { player.current.currentTime = start; void player.current.play().catch(() => {}); } }}>Assistir ao trecho original</button>
        <p className="ft-hint">Trecho de {time(Math.max(0, end - start))}. Nesta edição: um trecho contínuo de 3 segundos a 1 hora.</p>
        <label>Som do vídeo<select value={audioMode} onChange={e => { setAudioMode(e.target.value as FootageEdit['audioMode']); player.current?.pause(); }}><option value="original" disabled={!asset.hasAudio}>Áudio original{!asset.hasAudio ? ' · indisponível' : ''}</option><option value="ambient">Faixa ambiente da biblioteca</option><option value="silent">Sem áudio</option></select></label>
        {audioMode === 'ambient' && <label>Faixa ambiente<select value={ambientId} onChange={e => setAmbientId(e.target.value)} required><option value="">Escolha uma faixa</option>{audio.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><small>A faixa será repetida se for menor que o trecho. Confira se a emenda soa natural. Envie um MP3 ou WAV pela biblioteca.</small></label>}
        <p className="ft-hint">Uma faixa de áudio pode estar silenciosa. O nivelamento não cria sons ausentes. Quando houver som, ele recebe nivelamento e entrada e saída suaves; confira também sons repentinos ao assistir.</p>
        <label>Resolução<select value={resolution} onChange={e => setResolution(e.target.value)}>{formats.map(format => <option key={format.key} value={format.key} disabled={Math.min(format.width / (asset.width || 1), format.height / (asset.height || 1)) > 1.001}>{format.name}</option>)}</select><small>Sem ampliar artificialmente a filmagem. A proporção original é preservada, com barras quando necessário.</small></label>
        <div className="ft-soft-note"><Check size={17} /><span>Movimento na cadência original, sem cortes internos. Entrada e saída de até 1,5 segundo.</span></div>
        {asset.license.startsWith('cc-by-sa-') && <p className="ft-hint">A edição mantém a licença CC BY-SA. Ao publicar, inclua os créditos e links do arquivo “Baixar créditos”.</p>}
        {!asset.rightsConfirmed && <p className="ft-error">Confira a licença em “Fonte e créditos” para exportar.</p>}
        {error && <p className="ft-error" role="alert">{error}</p>}
        <button className="ft-button ft-primary" disabled={busy || !asset.rightsConfirmed}><Scissors size={17} />{busy ? 'Preparando…' : 'Exportar trecho em MP4'}</button>
      </form>
    </div>
  </>;
}

function downloadCredits(job: FootageExport) {
  const text = [`Slow View TV — ${job.title}`, `Trecho: ${job.start}s a ${job.end}s · ${job.width} × ${job.height}`, 'Alterações por Slow View TV: corte, entrada e saída suaves; áudio conforme seleção.', ...(job.outputLicenseUrl ? [`Licença desta adaptação: ${licenses[job.outputLicense!] || job.outputLicense}`, job.outputLicenseUrl, 'Ao publicar online, mantenha os links abaixo clicáveis na descrição e distribua esta adaptação sob a licença indicada.'] : []), '', ...job.sources.flatMap(source => [source.title, `Fonte: ${source.sourceUrl || 'Material próprio'}`, `Licença declarada: ${licenses[source.license] || source.license}`, `Créditos: ${source.attribution || 'Não informados'}`, source.licenseNotes, ''])].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `creditos-${job.id}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function QuietPlayer({ job, onClose }: { job: FootageExport; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), player = useRef<HTMLVideoElement>(null);
  const [minutes, setMinutes] = useState(0), [elapsed, setElapsed] = useState(0), [pausedByTimer, setPausedByTimer] = useState(false);
  const [volume, setVolume] = useState(.2);
  useEffect(() => { dialog.current?.showModal(); if (player.current) player.current.volume = .2; }, []);
  useEffect(() => {
    const timer = setInterval(() => { if (minutes && player.current && !player.current.paused) setElapsed(value => value + 1); }, 1000);
    return () => clearInterval(timer);
  }, [minutes]);
  useEffect(() => { if (minutes && elapsed >= minutes * 60) { player.current?.pause(); setPausedByTimer(true); setMinutes(0); } }, [elapsed, minutes]);
  return <dialog ref={dialog} className="ft-quiet" onCancel={onClose} onClose={onClose} aria-label={`Assistir sem distrações: ${job.title}`}>
    <div className="ft-quiet-top"><h2>{job.title}</h2><button className="ft-button" onClick={onClose}><X size={17} />Fechar vídeo</button></div>
    <video ref={player} controls playsInline preload="metadata" src={mediaUrl(job.fileUrl!)} aria-label={job.title} />
    <div className="ft-quiet-options"><label>Volume inicial baixo<input type="range" aria-label="Volume" min="0" max="1" step="0.01" value={volume} onChange={e => { const value = Number(e.target.value); setVolume(value); if (player.current) { player.current.volume = value; player.current.muted = value === 0; } }} /></label>
      <label>Pausa automática<select value={minutes} onChange={e => { setMinutes(Number(e.target.value)); setElapsed(0); setPausedByTimer(false); }}><option value="0">Sem temporizador</option><option value="5">Após 5 minutos assistindo</option><option value="10">Após 10 minutos assistindo</option><option value="20">Após 20 minutos assistindo</option></select></label>
      <p>{pausedByTimer ? 'Vídeo pausado pelo temporizador. Continue quando quiser.' : 'Dê o play quando quiser. Ao terminar, nenhum outro vídeo começa.'}</p></div>
  </dialog>;
}

export default function FootageStudio() {
  const [view, setView] = useState<'library' | 'edit' | 'exports' | 'trains'>('library');
  const [assets, setAssets] = useState<FootageAsset[]>([]), [exports, setExports] = useState<FootageExport[]>([]);
  const [config, setConfig] = useState({ pexelsSearch: false, maxUploadBytes: 512 * 1024 ** 2 });
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState(''), [importOpen, setImportOpen] = useState(false), [seed, setSeed] = useState<StockVideo | undefined>();
  const [watching, setWatching] = useState<FootageExport | null>(null);
  const [query, setQuery] = useState('natureza tranquila'), [results, setResults] = useState<StockVideo[]>([]), [searching, setSearching] = useState(false);
  const selected = assets.find(asset => asset.id === selectedId);
  const refresh = useCallback(async () => {
    const [library, jobs] = await Promise.all([footageApi.assets(), footageApi.exports()]); setAssets(library.assets); setExports(jobs.exports);
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([footageApi.config().then(value => { if (active) setConfig(value); }), refresh()]).catch(err => { if (active) setError(errorMessage(err)); }).finally(() => { if (active) setLoading(false); });
    const timer = setInterval(() => { if (!document.hidden) void refresh().catch(err => { if (active) setError(errorMessage(err)); }); }, 4000);
    return () => { active = false; clearInterval(timer); };
  }, [refresh]);
  useEffect(() => { if (!exports.some(job => ['queued', 'editing'].includes(job.status))) setNotice(''); }, [exports]);
  const openImport = (video?: StockVideo) => { setSeed(video); setImportOpen(true); setNotice(''); };
  async function search(event: FormEvent) {
    event.preventDefault(); setSearching(true); setError('');
    try { setResults((await footageApi.search(query)).videos); } catch (err) { setError(errorMessage(err)); } finally { setSearching(false); }
  }
  async function createExport(edit: FootageEdit) {
    await footageApi.edit(edit); await refresh(); setView('exports'); setNotice('Edição na fila. Você pode continuar na biblioteca enquanto ela é preparada.');
  }
  async function cancel(id: string) { try { await footageApi.cancel(id); await refresh(); } catch (err) { setError(errorMessage(err)); } }
  async function openJourney(id: string) { try { await refresh(); setSelectedId(id); setView('edit'); } catch (err) { setError(errorMessage(err)); } }
  const videos = assets.filter(asset => asset.status === 'ready' && asset.kind === 'video').length;
  return <div className="ft-studio">
    <aside className="ft-sidebar"><a className="ft-brand" href="/"><img src="/favicon.svg" alt="" /><span>Slow View TV<small>FILMAGENS REAIS</small></span></a>
      <nav aria-label="Ateliê de vídeos"><button className={view === 'trains' ? 'active' : ''} aria-current={view === 'trains' ? 'page' : undefined} onClick={() => setView('trains')}><TrainFront size={19} />Trem</button><button className={['library', 'edit'].includes(view) ? 'active' : ''} aria-current={['library', 'edit'].includes(view) ? 'page' : undefined} onClick={() => setView('library')}><Library size={19} />Biblioteca</button><button className={view === 'exports' ? 'active' : ''} aria-current={view === 'exports' ? 'page' : undefined} onClick={() => setView('exports')}><Film size={19} />Minhas edições<span>{exports.filter(item => item.status === 'completed').length}</span></button></nav>
      <div className="ft-sidebar-foot"><Headphones size={23} /><p>Você escolhe o ritmo.<br />O play também é seu.</p><a href="/prototype">Arquivo do protótipo 3D</a><button onClick={() => void api.logout().catch(err => setError(errorMessage(err)))}><LogOut size={16} />Sair do ateliê</button></div>
    </aside>
    <main className="ft-main"><div className="ft-topline"><span>Seu ateliê / {view === 'exports' ? 'Edições' : view === 'edit' ? 'Editor' : view === 'trains' ? 'Trem' : 'Biblioteca'}</span><span>Sem reprodução automática</span></div>
      {error && <div className="ft-error ft-banner" role="alert"><span>{error}</span><button className="ft-icon" onClick={() => setError('')} aria-label="Fechar aviso"><X size={18} /></button></div>}
      {notice && <p className="ft-notice" role="status">{notice}</p>}
      {view === 'trains' ? <TrainLibrary onLibrary={() => setView('library')} onOpenAsset={id => void openJourney(id)} /> : view === 'edit' && selected ? <Editor key={selected.id} asset={selected} assets={assets} onBack={() => setView('library')} onExport={createExport} onUpdate={refresh} /> : view === 'exports' ? <>
        <div className="ft-heading"><div><p className="ft-eyebrow">DO SEU ATELIÊ PARA O MUNDO</p><h1>Suas edições.</h1><p>Assista com calma antes de publicar. Cada vídeo guarda suas fontes.</p></div><button className="ft-button" onClick={() => setView('library')}><Plus size={17} />Escolher filmagem</button></div>
        {!exports.length && <div className="ft-empty ft-panel"><Film size={34} /><h2>Um trecho pode ser o começo.</h2><p>Escolha uma filmagem na biblioteca para preparar sua primeira edição.</p></div>}
        <div className="ft-export-list">{exports.map(job => <article className="ft-panel ft-export" key={job.id}><div className="ft-panel-title"><div><h2>{job.title}</h2><p>{time(job.duration)} · {job.height}p · {job.hasAudio ? 'Com faixa de áudio' : 'Sem faixa de áudio'}</p></div><span className={`ft-status ${job.status}`}>{statuses[job.status]}</span></div>
          {['queued', 'editing'].includes(job.status) && <><progress value={job.progress} max="1" aria-label={`Progresso de ${job.title}`} /><div className="ft-panel-title"><small>{Math.floor(job.progress * 100)}% · A duração depende do arquivo e do servidor.</small><button className="ft-text-button" onClick={() => void cancel(job.id)}>Cancelar edição</button></div></>}
          {job.error && <p className="ft-error">{job.error}</p>}
          {job.fileUrl && <><video controls playsInline preload="metadata" src={mediaUrl(job.fileUrl)} aria-label={`Edição: ${job.title}`} onLoadedMetadata={e => { e.currentTarget.volume = .3; }} /><div className="ft-export-actions"><button className="ft-button ft-primary" onClick={() => { document.querySelectorAll('video,audio').forEach(element => (element as HTMLMediaElement).pause()); setWatching(job); }}><Headphones size={17} />Assistir sem distrações</button><a className="ft-button" href={`${mediaUrl(job.fileUrl)}&download=1`}><Download size={17} />Baixar MP4</a><button className="ft-button" onClick={() => downloadCredits(job)}>Baixar créditos</button></div></>}
        </article>)}</div>
      </> : <>
        <div className="ft-heading"><div><p className="ft-eyebrow">IMAGENS REAIS, NO SEU TEMPO</p><h1>Um lugar para desacelerar.</h1><p>Reúna filmagens e sons. Escolha um trecho. Dê espaço à paisagem.</p></div><button className="ft-button ft-primary" onClick={() => openImport()}><Plus size={18} />Adicionar material</button></div>
        {importOpen && <ImportPanel key={seed?.id || 'upload'} seed={seed} limit={config.maxUploadBytes} onClose={() => setImportOpen(false)} onImported={refresh} />}
        <section className="ft-panel ft-discover"><div><p className="ft-eyebrow">ENCONTRAR UMA PAISAGEM</p><h2>Comece por uma fonte.</h2><p>Busque planos longos, câmera estável e movimento suave. Confira a licença de cada arquivo na página original.</p></div>
          <div className="ft-source-links"><a href={`https://www.pexels.com/search/videos/${encodeURIComponent(query)}/`} target="_blank" rel="noreferrer">Buscar no Pexels <ArrowUpRight size={15} /></a><a href={`https://pixabay.com/videos/search/${encodeURIComponent(query)}/`} target="_blank" rel="noreferrer">Buscar no Pixabay <ArrowUpRight size={15} /></a></div>
          {config.pexelsSearch ? <form className="ft-search" onSubmit={e => void search(e)}><label>Buscar filmagens no Pexels<input value={query} onChange={e => setQuery(e.target.value)} maxLength={100} required /></label><button className="ft-button" disabled={searching}><Search size={17} />{searching ? 'Buscando…' : 'Buscar'}</button></form>
            : <p className="ft-hint">A busca integrada ainda não está configurada neste servidor. Abra uma fonte acima, baixe o material autorizado e use “Adicionar material”.</p>}
          {results.length > 0 && <div className="ft-results">{results.map(video => <article key={video.id}><h3>{video.author || video.title}</h3><p>{time(video.duration)} · {video.width} × {video.height}</p><a href={video.sourceUrl} target="_blank" rel="noreferrer">Ver filmagem e licença <ArrowUpRight size={14} /></a><button className="ft-button" onClick={() => openImport(video)}>Preparar importação</button></article>)}</div>}
        </section>
        <div className="ft-section-title"><h2>Sua biblioteca</h2><span>{videos} filmagens · {assets.filter(asset => asset.kind === 'audio').length} faixas de áudio</span></div>
        {loading ? <p role="status">Abrindo a biblioteca…</p> : !assets.length ? <div className="ft-panel ft-empty"><Film size={36} /><h2>O primeiro cenário vem de uma filmagem.</h2><p>Adicione um vídeo real para assistir e escolher o primeiro trecho.</p><button className="ft-button" onClick={() => openImport()}><Upload size={17} />Importar vídeo ou áudio</button>
          <h3>Uma amostra real para experimentar</h3><p>Trem na neve · cerca de 26 segundos. O arquivo 720p desta amostra está sem som audível, embora contenha uma faixa de áudio. Local informado pela fonte: Himachal Pradesh, Índia. O percurso e o modelo do trem ainda não foram identificados.</p><a href={sampleVideo.sourceUrl} target="_blank" rel="noreferrer">Ver filmagem de shalender kumar no Pexels <ArrowUpRight size={14} /></a><button className="ft-button" onClick={() => openImport(sampleVideo)}>Preparar importação da amostra</button><p className="ft-hint">A importação começa depois de conferir a fonte e a licença. Não há mapa sincronizado nesta amostra.</p></div>
          : <div className="ft-asset-grid">{assets.map(asset => <article className="ft-panel ft-asset" key={asset.id}>
            <div className="ft-asset-art">{asset.kind === 'audio' ? <Headphones size={32} /> : <Film size={32} />}<span>{asset.kind === 'audio' ? 'Áudio' : asset.status === 'ready' ? 'Filmagem' : 'Importação'}</span></div>
            <div className="ft-asset-body"><h3>{asset.title}</h3><p>{asset.status === 'ready' ? `${time(asset.duration)}${asset.kind === 'video' ? ` · ${asset.width} × ${asset.height}` : ''}` : asset.status === 'failed' ? 'Envio não concluído' : 'Recebendo material…'}</p><p className="ft-hint">{licenses[asset.license]}{!asset.rightsConfirmed ? ' · Conferência pendente' : ''}</p>
              {asset.error && <p className="ft-error">{asset.error}</p>}
              {asset.status === 'ready' && asset.kind === 'video' && <button className="ft-button" onClick={() => { setSelectedId(asset.id); setView('edit'); }}><Scissors size={16} />Assistir e editar</button>}
              {asset.status === 'ready' && asset.kind === 'audio' && <><audio controls preload="none" src={mediaUrl(asset.fileUrl!)} aria-label={asset.title} onLoadedMetadata={e => { e.currentTarget.volume = .3; }} />{!asset.rightsConfirmed && <label className="ft-check"><input type="checkbox" onChange={() => void footageApi.update(asset.id, { ...asset, rightsConfirmed: true }).then(refresh).catch(err => setError(errorMessage(err)))} />Conferi os direitos desta faixa.</label>}</>}
              {asset.status === 'failed' && <button className="ft-text-button" onClick={() => void footageApi.remove(asset.id).then(refresh).catch(err => setError(errorMessage(err)))}>Remover envio incompleto</button>}
            </div></article>)}</div>}
      </>}
    </main>{watching && <QuietPlayer job={watching} onClose={() => setWatching(null)} />}
  </div>;
}
