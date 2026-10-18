import { useCallback, useEffect, useId, useState } from 'react';
import { ArrowRight, BookOpen, Check, Cloud, Database, ExternalLink, Film, Layers3, LoaderCircle, MapPin, Save, Server, TrainFront } from 'lucide-react';
import { request } from './api';
import './knowledge.css';

interface KnowledgeSource {
  id: string; name: string; category: string;
  status: 'prepared' | 'pending' | 'reference'; statusLabel: string;
  summary: string; limitations: string;
  links: { label: string; url: string }[];
}
interface KnowledgeSnapshot { sources: KnowledgeSource[]; projectNotes: string; updatedAt: string }

const pipeline = [
  { icon: MapPin, title: 'Validar a viagem', text: 'Escolher serviço e paradas. Conferir o traçado completo, curvas, túneis e pontes.' },
  { icon: Layers3, title: 'Construir o lugar', text: 'Combinar relevo, ocupação do solo e referências locais em um cenário contínuo.' },
  { icon: TrainFront, title: 'Salvar atmosferas', text: 'Reutilizar a rota com estação do ano, horário e clima. A luz evolui durante a viagem.' },
  { icon: Film, title: 'Renderizar e revisar', text: 'Exportar o percurso completo com áudio e mapa sincronizados. Conferir o resultado antes de publicar.' },
];

function formatSavedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'no banco do ateliê' : `em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date)}`;
}

export function KnowledgeTab() {
  const [snapshot, setSnapshot] = useState<KnowledgeSnapshot | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const notesId = useId();
  const dirty = snapshot !== null && notes !== snapshot.projectNotes;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const next = await request<KnowledgeSnapshot>('/knowledge');
      setSnapshot(next); setNotes(next.projectNotes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as fontes do projeto.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveNotes(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true); setError(''); setFeedback('');
    try {
      const next = await request<KnowledgeSnapshot>('/knowledge', { method: 'PUT', body: JSON.stringify({ projectNotes: notes }) });
      setSnapshot(next); setNotes(next.projectNotes); setFeedback('Notas salvas no banco do ateliê.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar as notas. Seu texto continua no formulário.');
    } finally { setSaving(false); }
  }

  return <section className="knowledge-page" aria-labelledby="knowledge-title">
    <div className="page-title"><div><span className="eyebrow">A BASE DE CADA VIAGEM</span><h1 id="knowledge-title">Fontes e plano</h1><p>Os dados, as decisões e o caminho para viagens completas.</p></div><div className="knowledge-title-icon" aria-hidden="true"><BookOpen size={29} strokeWidth={1.25} /></div></div>

    <div className="knowledge-overview">
      <div><span className="knowledge-kicker">NOSSO PRIMEIRO DESTINO</span><h2>Viena <ArrowRight size={19} aria-label="para" /> Praga</h2><p>Uma rota real, muitas atmosferas. Primeiro de trem; novas formas de viajar vêm depois.</p></div>
      <div className="knowledge-target"><span>O objetivo</span><strong>Percurso inteiro em 4K</strong><p>A duração acompanha a viagem, com continuidade do cenário e do som.</p></div>
    </div>

    <div className="knowledge-progress" role="note"><Check size={18} aria-hidden="true" /><p><strong>O que já foi verificado:</strong> exportação técnica em 4K de 2 segundos. A renderização de horas e a fidelidade visual de Viena–Praga ainda precisam ser validadas. O cenário atual é ilustrativo e não tem áudio.</p></div>

    <section className="knowledge-pipeline" aria-labelledby="knowledge-pipeline-title">
      <div className="section-heading"><h2 id="knowledge-pipeline-title">Como vamos construir</h2><span>Preparar uma vez · reutilizar em novas versões</span></div>
      <ol>{pipeline.map(({ icon: Icon, title, text }, index) => <li key={title}><div className="knowledge-step-top"><Icon size={20} strokeWidth={1.4} aria-hidden="true" /><span aria-label={`Etapa ${index + 1}`}>0{index + 1}</span></div><h3>{title}</h3><p>{text}</p></li>)}</ol>
    </section>

    <section className="knowledge-architecture" aria-labelledby="knowledge-architecture-title">
      <div><span className="knowledge-kicker">ONDE CADA PARTE TRABALHA</span><h2 id="knowledge-architecture-title">Você cria no painel.<br />O servidor produz o vídeo.</h2><p>O Netlify hospeda a interface. A produção longa fica em um serviço de processamento separado, com fila e arquivos persistentes.</p></div>
      <ol>
        <li><Cloud size={18} aria-hidden="true" /><span><strong>Netlify</strong><small>Painel de escolha e acompanhamento</small></span></li>
        <li><Database size={18} aria-hidden="true" /><span><strong>API e banco de dados</strong><small>Rotas, versões e estado das produções</small></span></li>
        <li><Server size={18} aria-hidden="true" /><span><strong>Fila e processamento com GPU</strong><small>Renderização longa em trabalhadores externos</small></span></li>
        <li><Film size={18} aria-hidden="true" /><span><strong>Armazenamento de vídeos</strong><small>Visualização e download dos arquivos finais</small></span></li>
      </ol>
      <p className="knowledge-architecture-note">Hoje, API, SQLite e renderizador rodam no servidor do ateliê. Fila distribuída, armazenamento de objetos e serviço externo de GPU ainda fazem parte do plano de produção.</p>
    </section>

    <section className="knowledge-hardware" aria-labelledby="knowledge-hardware-title">
      <div className="section-heading"><h2 id="knowledge-hardware-title">Uma base para dimensionar o piloto</h2><span>Infraestrutura futura · sob demanda</span></div>
      <div className="knowledge-hardware-grid"><article><Server size={21} strokeWidth={1.4} aria-hidden="true" /><span className="knowledge-kicker">PRODUÇÃO 3D</span><h3>Uma máquina para renderizar</h3><p>8 vCPU · 32 GB de RAM<br />RTX 4090 · 24 GB de memória da GPU<br />100–200 GB de disco</p></article><article><Database size={21} strokeWidth={1.4} aria-hidden="true" /><span className="knowledge-kicker">PAINEL E CATÁLOGO</span><h3>Um servidor separado</h3><p>API e banco: referência inicial de 2 vCPU e 4 GB de RAM na DigitalOcean. O painel continua no Netlify.</p></article></div>
      <p className="knowledge-hardware-note">Essa é uma referência de partida, não uma contratação. A GPU é ligada conforme a necessidade. Disponibilidade, preços e recursos serão conferidos e ajustados com medições; o trabalhador externo ainda não está integrado.</p>
    </section>

    <section aria-labelledby="knowledge-sources-title">
      <div className="section-heading"><h2 id="knowledge-sources-title">Biblioteca de fontes</h2><span>Referências e limites de cada integração</span></div>
      {loading ? <p className="knowledge-loading" role="status"><LoaderCircle size={17} className="spin" aria-hidden="true" /> Carregando as fontes e suas notas…</p> : snapshot && <div className="knowledge-source-grid">{snapshot.sources.map((source) => <article className="knowledge-source" key={source.id}>
        <div className="knowledge-source-top"><span className="knowledge-kicker">{source.category}</span><span className={`knowledge-status knowledge-status-${source.status}`}>{source.statusLabel}</span></div>
        <h3>{source.name}</h3><p>{source.summary}</p>
        <details><summary>O que precisamos conferir</summary><p>{source.limitations}</p></details>
        <div className="knowledge-source-links">{source.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ExternalLink size={12} aria-hidden="true" /><span className="knowledge-sr-only"> (abre em nova aba)</span></a>)}</div>
      </article>)}</div>}
      {error && <div className="knowledge-error" role="alert"><p>{error}</p>{!snapshot && <button type="button" className="button secondary" onClick={() => void load()} disabled={loading}>Tentar novamente</button>}</div>}
    </section>

    <form className="knowledge-notes" onSubmit={(event) => void saveNotes(event)} aria-labelledby="knowledge-notes-title">
      <div className="knowledge-notes-heading"><div><span className="knowledge-kicker">MEMÓRIA DO PROJETO</span><h2 id="knowledge-notes-title">Nossas decisões</h2><p>Guarde prioridades e ideias para retomar na próxima visita.</p></div><Save size={22} strokeWidth={1.4} aria-hidden="true" /></div>
      <label htmlFor={notesId}>Notas do projeto</label>
      <textarea id={notesId} rows={7} maxLength={20000} value={notes} onChange={(event) => { setNotes(event.target.value); setFeedback(''); }} disabled={loading || !snapshot || saving} aria-describedby={`${notesId}-help`} placeholder="O que queremos construir primeiro?" />
      <div className="knowledge-notes-bottom"><div><p id={`${notesId}-help`}>{dirty ? 'Há alterações ainda não salvas.' : snapshot ? `Último salvamento ${formatSavedAt(snapshot.updatedAt)}.` : 'Conecte o ateliê para carregar e salvar suas notas.'}</p><p className="knowledge-feedback" role="status" aria-live="polite">{feedback}</p></div><button type="submit" className="button primary" disabled={!dirty || saving || loading}>{saving ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}{saving ? 'Salvando…' : 'Salvar notas'}</button></div>
    </form>
  </section>;
}
