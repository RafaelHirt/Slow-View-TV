import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Download, MapPin, Pause, Search, TrainFront } from 'lucide-react';
import { footageApi, type NrkImport } from './footage-api';
import './train-library.css';

// Editorial catalogue from the official NRK publications checked on 19 October 2026.
// Availability comes from the server; editorial metadata does not prove a download.
const journeys = [
  {
    id: 'nordlandsbanen', name: 'Nordlandsbanen', origin: 'Trondheim', destination: 'Bodø', country: 'Noruega',
    duration: 'Cerca de 10 horas por viagem', train: 'NSB Di. 4',
    description: 'Uma viagem ao norte, registrada nas quatro estações do ano.',
    versions: 'Inverno, primavera, verão e outono · Full HD',
    location: 'GPS publicado pela NRK; dados e sincronização ainda precisam ser validados.',
    license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://nrkbeta.no/2013/01/15/nordlandsbanen-minute-by-minute-season-by-season/',
    rightsUrl: 'https://nrkbeta.no/2012/12/29/konkurrer-og-last-ned-den-synkrone-nordlandsbanen-minutt-for-minutt/',
  },
  {
    id: 'flamsbanen', name: 'Flåmsbanen', origin: 'Myrdal', destination: 'Flåm', country: 'Noruega',
    duration: 'Duração a conferir no arquivo', train: 'Modelo do trem a confirmar',
    description: 'Da estação de montanha até Flåm, junto ao fiorde.',
    versions: 'Versão 2D Full HD identificada',
    location: 'Origem e destino documentados; mapa e sincronização ainda em preparação.',
    license: 'CC BY-SA 3.0 Noruega', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/no/',
    sourceUrl: 'https://nrkbeta.no/2010/09/03/last-ned-flaamsbana-i-2d-og-3d/',
    rightsUrl: 'https://nrkbeta.no/2010/09/03/last-ned-flaamsbana-i-2d-og-3d/',
  },
  {
    id: 'bergensbanen', name: 'Bergensbanen', origin: 'Bergen', destination: 'Oslo', country: 'Noruega',
    duration: 'Cerca de 7 horas de câmera frontal', train: 'Modelo do trem a confirmar',
    description: 'Do litoral de Bergen, atravessando as montanhas, até Oslo.',
    versions: 'Câmera frontal limpa · HD 720p50',
    location: 'Sentido da viagem documentado; mapa e sincronização ainda em preparação.',
    license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://nrkbeta.no/2009/12/18/bergensbanen-eng/',
    rightsUrl: 'https://nrkbeta.no/2009/12/18/bergensbanen-eng/',
  },
];

const searchable = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ø/g, 'o');
const durationText = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, Math.floor(seconds % 60)].map((value, index) => index ? String(value).padStart(2, '0') : value).join(':');

export function TrainLibrary({ onLibrary, onOpenAsset }: { onLibrary: () => void; onOpenAsset: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [nrk, setNrk] = useState<NrkImport | null>(null), [error, setError] = useState(''), [loadError, setLoadError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => footageApi.nrk().then(value => { if (active) { setNrk(value); setLoadError(''); } }).catch(() => { if (active) setLoadError('A importação de viagens precisa da versão atual do servidor RunPod. A biblioteca existente continua disponível.'); });
    void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 4000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  async function transfer(pause = false) {
    setBusy(true); setError('');
    try { setNrk(await (pause ? footageApi.pauseNrk() : footageApi.importNrk())); }
    catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível iniciar a transferência.'); }
    finally { setBusy(false); }
  }
  const download = nrk?.download, transferring = download && ['downloading', 'verifying'].includes(download.status);
  const importLabels = { downloading: 'Baixando', verifying: 'Conferindo arquivo', paused: 'Pausado', failed: 'Download pendente', ready: 'Na biblioteca' };
  const visible = journeys.filter(journey => searchable(`${journey.name} ${journey.origin} ${journey.destination} ${journey.country} ${journey.train}`).includes(searchable(query.trim())));
  return <>
    <div className="ft-heading"><div><p className="ft-eyebrow">PERCURSOS IDENTIFICADOS, HISTÓRIAS REAIS</p><h1>Viagens de trem.</h1><p>Conheça os percursos pesquisados e acompanhe a preparação de cada viagem.</p></div></div>
    <section className="ft-panel ft-train-intro" aria-label="Estado do catálogo de trens">
      <div><TrainFront size={25} /><div><strong>{journeys.length} percursos pesquisados</strong><p>{download?.status === 'ready' ? 'Flåmsbanen disponível na biblioteca para conferir e preparar uma amostra. As outras viagens continuam em preparação.' : 'Fontes e condições de uso consultadas. Comece pela importação da Flåmsbanen para conferir a primeira viagem completa.'}</p></div></div>
      <button className="ft-button" onClick={onLibrary}>Abrir biblioteca de materiais <ArrowRight size={16} /></button>
    </section>
    <label className="ft-train-search"><span><Search size={15} />Buscar percurso, cidade ou trem</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: Trondheim, Flåm ou Bergen" /></label>
    <div className="ft-train-grid">{visible.map(journey => <article className="ft-panel ft-train-card" key={journey.id} aria-labelledby={`journey-${journey.id}`}>
      <div className="ft-train-card-top"><span><MapPin size={14} />{journey.country}</span><span className="ft-status">{journey.id === 'flamsbanen' && download ? download.status === 'downloading' && download.completed === 0 ? 'Aguardando transferência' : importLabels[download.status] : 'Em preparação'}</span></div>
      <h2 id={`journey-${journey.id}`}>{journey.name}</h2>
      <p className="ft-train-route"><span>{journey.origin}</span><ArrowRight size={17} aria-label="até" /><span>{journey.destination}</span></p>
      <p>{journey.description}</p>
      <dl><div><dt>Viagem</dt><dd>{journey.id === 'flamsbanen' && download?.asset?.duration ? `${durationText(download.asset.duration)} · duração do arquivo` : journey.duration}</dd></div><div><dt>Trem</dt><dd>{journey.train}</dd></div><div><dt>Material identificado</dt><dd>{journey.versions}</dd></div><div><dt>Mapa</dt><dd>{journey.location}</dd></div></dl>
      <div className="ft-train-source"><span><Check size={15} />Fonte: NRK · publicação consultada</span><a href={journey.licenseUrl} target="_blank" rel="noreferrer">{journey.license}</a><p>Créditos e condições da publicação devem acompanhar a edição.</p></div>
      <details><summary>O que falta para assistir</summary><p>{journey.id === 'flamsbanen' && download?.status === 'ready' ? 'O arquivo está na biblioteca. Confira imagem e som antes de preparar a primeira amostra. O mapa permanece em preparação.' : 'Obter o arquivo de vídeo, conferir imagem e áudio, preparar o mapa e revisar a edição. Este registro apresenta a pesquisa da viagem.'}</p><a href={journey.rightsUrl} target="_blank" rel="noreferrer">Condições publicadas pela NRK <ArrowUpRight size={13} /></a></details>
      {journey.id === 'flamsbanen' && <div className="ft-train-import">
        <p>Primeira viagem · arquivo 2D Full HD de 3,76 GB. Baixado diretamente no RunPod, sem passar pelo seu computador.</p>
        {download?.status === 'ready' && download.assetId ? <button className="ft-button ft-primary" onClick={() => onOpenAsset(download.assetId!)}>Abrir viagem e preparar amostra <ArrowRight size={15} /></button> : <>
          {transferring && <><progress max={download.total} value={download.completed} aria-label="Download da Flåmsbanen" /><p role="status">{download.status === 'verifying' ? 'Conferindo o arquivo recebido…' : `${Math.floor(download.completed / download.total * 100)}% · ${(download.completed / 1e9).toFixed(2).replace('.', ',')} de 3,76 GB. ${download.completed === 0 ? 'Procurando fontes do arquivo…' : 'O download continua enquanto o servidor estiver ligado.'}`}</p></>}
          <button className="ft-button ft-primary" disabled={busy || !nrk?.available} onClick={() => void transfer(Boolean(transferring))}>{transferring ? <Pause size={15} /> : <Download size={15} />}{busy ? 'Aguarde…' : transferring ? 'Pausar download' : download ? 'Retomar download no RunPod' : 'Baixar viagem no RunPod'}</button>
          {nrk && !nrk.available && <p>Atualize e ative a importação no RunPod para começar.</p>}
        </>}
        {(error || loadError || download?.error) && <p className="ft-error" role="alert">{error || loadError || download?.error}</p>}
        {download?.diagnostics && <details className="ft-download-diagnostics"><summary>Diagnóstico da tentativa</summary><dl>
          {download.diagnostics.source && <div><dt>Fonte da transferência</dt><dd>{download.diagnostics.source === 'nytsoi' ? 'Espelho Nytsoi · conteúdo conferido com a NRK' : 'Torrent oficial NRK'}</dd></div>}
          {download.diagnostics.privateTorrent !== undefined && <div><dt>Descoberta de fontes</dt><dd>{download.diagnostics.privateTorrent ? 'Torrent privado · depende dos rastreadores' : 'Torrent público · permite descoberta DHT'}</dd></div>}
          <div><dt>Duração registrada</dt><dd>{download.diagnostics.elapsedSeconds}s</dd></div>
          <div><dt>Maior número de conexões</dt><dd>{download.diagnostics.maxConnections ?? 'Não informado pelo programa'}</dd></div>
          <div><dt>Fontes completas conectadas</dt><dd>{download.diagnostics.maxSeeders ?? 'Não informado pelo programa'}</dd></div>
          <div><dt>Falhas de rastreador registradas</dt><dd>{download.diagnostics.trackerFailures}</dd></div>
          <div><dt>Código de saída</dt><dd>{download.diagnostics.exitCode ?? (download.diagnostics.signal || 'Ainda em execução')}</dd></div>
          {!!download.diagnostics.errorCodes.length && <div><dt>Códigos de erro registrados</dt><dd>{download.diagnostics.errorCodes.join(', ')}</dd></div>}
        </dl>{download.diagnostics.resumeRechecked && <p>As partes anteriores foram preservadas e serão conferidas para continuar pelo novo torrent.</p>}<p>Esses dados ajudam a distinguir falha de conexão, armazenamento e transferência incompleta. Zero conexões não comprova que o arquivo deixou de existir.</p></details>}
        <p>Conferir o som e a imagem faz parte da preparação. A edição mantém créditos NRK e licença CC BY-SA.</p>
      </div>}
      <a className="ft-button" href={journey.sourceUrl} target="_blank" rel="noreferrer">Ver publicação da viagem <ArrowUpRight size={15} /></a>
    </article>)}</div>
    {!visible.length && <div className="ft-panel ft-empty"><TrainFront size={30} /><h2>Nenhum percurso encontrado.</h2><p>Tente o nome da viagem, uma cidade ou o trem.</p><button className="ft-button" onClick={() => setQuery('')}>Limpar busca</button></div>}
  </>;
}
