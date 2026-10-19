import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, MapPin, Search, TrainFront } from 'lucide-react';
import './train-library.css';

// Editorial catalogue from the official NRK publications checked on 19 October 2026.
// These are researched journeys; they are not imported footage or synchronized maps.
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

export function TrainLibrary({ onLibrary }: { onLibrary: () => void }) {
  const [query, setQuery] = useState('');
  const visible = journeys.filter(journey => searchable(`${journey.name} ${journey.origin} ${journey.destination} ${journey.country} ${journey.train}`).includes(searchable(query.trim())));
  return <>
    <div className="ft-heading"><div><p className="ft-eyebrow">PERCURSOS IDENTIFICADOS, HISTÓRIAS REAIS</p><h1>Viagens de trem.</h1><p>Conheça os percursos pesquisados e acompanhe a preparação de cada viagem.</p></div></div>
    <section className="ft-panel ft-train-intro" aria-label="Estado do catálogo de trens">
      <div><TrainFront size={25} /><div><strong>{journeys.length} percursos pesquisados</strong><p>Fontes e condições de uso consultadas. As filmagens ainda precisam ser obtidas e preparadas para assistir no ateliê.</p></div></div>
      <button className="ft-button" onClick={onLibrary}>Abrir biblioteca de materiais <ArrowRight size={16} /></button>
    </section>
    <label className="ft-train-search"><span><Search size={15} />Buscar percurso, cidade ou trem</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: Trondheim, Flåm ou Bergen" /></label>
    <div className="ft-train-grid">{visible.map(journey => <article className="ft-panel ft-train-card" key={journey.id} aria-labelledby={`journey-${journey.id}`}>
      <div className="ft-train-card-top"><span><MapPin size={14} />{journey.country}</span><span className="ft-status">Em preparação</span></div>
      <h2 id={`journey-${journey.id}`}>{journey.name}</h2>
      <p className="ft-train-route"><span>{journey.origin}</span><ArrowRight size={17} aria-label="até" /><span>{journey.destination}</span></p>
      <p>{journey.description}</p>
      <dl><div><dt>Viagem</dt><dd>{journey.duration}</dd></div><div><dt>Trem</dt><dd>{journey.train}</dd></div><div><dt>Material identificado</dt><dd>{journey.versions}</dd></div><div><dt>Mapa</dt><dd>{journey.location}</dd></div></dl>
      <div className="ft-train-source"><span><Check size={15} />Fonte: NRK · publicação consultada</span><a href={journey.licenseUrl} target="_blank" rel="noreferrer">{journey.license}</a><p>Créditos e condições da publicação devem acompanhar a edição.</p></div>
      <details><summary>O que falta para assistir</summary><p>Obter o arquivo de vídeo, conferir imagem e áudio, preparar o mapa e revisar a edição. Este registro apresenta a pesquisa da viagem.</p><a href={journey.rightsUrl} target="_blank" rel="noreferrer">Condições publicadas pela NRK <ArrowUpRight size={13} /></a></details>
      <a className="ft-button" href={journey.sourceUrl} target="_blank" rel="noreferrer">Ver publicação da viagem <ArrowUpRight size={15} /></a>
    </article>)}</div>
    {!visible.length && <div className="ft-panel ft-empty"><TrainFront size={30} /><h2>Nenhum percurso encontrado.</h2><p>Tente o nome da viagem, uma cidade ou o trem.</p><button className="ft-button" onClick={() => setQuery('')}>Limpar busca</button></div>}
  </>;
}
