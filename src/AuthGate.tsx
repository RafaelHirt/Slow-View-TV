import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { request } from './api';
import './auth.css';

type AuthStatus = { configured: boolean; authenticated: boolean; setupAllowed: boolean; mode: 'password' | 'token' | 'setup' | 'disabled' };

export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [credential, setCredential] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const check = useCallback(async () => {
    setChecking(true);
    try { setStatus(await request<AuthStatus>('/auth/status')); setError(''); }
    catch (err) { setStatus(null); setError((err as Error).message); }
    finally { setChecking(false); }
  }, []);
  useEffect(() => {
    void check();
    const changed = () => { setStatus(null); setCredential(''); setConfirmation(''); void check(); };
    window.addEventListener('slowvista:auth-change', changed);
    return () => window.removeEventListener('slowvista:auth-change', changed);
  }, [check]);
  if (status?.authenticated) return children;
  const setup = status?.mode === 'setup';
  const token = status?.mode === 'token';
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (setup && credential !== confirmation) { setError('As senhas precisam ser iguais.'); return; }
    setBusy(true);
    try {
      const result = await request<{ token: string; expiresAt: string }>(setup ? '/auth/setup' : '/auth/login', {
        method: 'POST', body: JSON.stringify(token ? { token: credential } : { password: credential }),
      });
      sessionStorage.setItem('slowvista-token', result.token);
      setCredential(''); setConfirmation(''); await check();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="auth-page">
    <section className="auth-landscape" aria-hidden="true"><div className="auth-sun" /><div className="auth-hill distant" /><div className="auth-hill near" /><div className="auth-rail" /><p>O mundo tem seu ritmo.<br /><em>Encontre o seu.</em></p></section>
    <section className="auth-card" aria-label="Acesso ao Slow View TV">
      <div className="brand brand-slowview"><img src="/favicon.svg" alt="" /><span>Slow View TV<small>CREATOR STUDIO</small></span></div>
      {checking ? <div className="auth-checking" role="status"><LoaderCircle className="spin" size={24} />Abrindo seu ateliê…</div> : <>
        <div className="auth-lock"><LockKeyhole size={23} strokeWidth={1.5} /></div>
        <div className="eyebrow">SEU ATELIÊ PARTICULAR</div>
        <h1>{setup ? 'Um começo seguro.' : 'Bem-vindo ao seu ritmo.'}</h1>
        <p className="auth-intro">{!status ? 'Conecte o painel ao servidor para abrir seu espaço de criação.' : setup ? 'Crie uma senha para guardar seus vídeos, fontes e edições.' : 'Entre para continuar suas próximas criações.'}</p>
        {status && (!setup || status.setupAllowed) && <form onSubmit={(event) => void submit(event)}>
          <label className="field-label" htmlFor="dashboard-password">{token ? 'Chave de acesso' : setup ? 'Criar senha' : 'Senha'}</label>
          <input id="dashboard-password" type="password" autoComplete={setup ? 'new-password' : token ? 'off' : 'current-password'} required minLength={token ? 1 : 12} maxLength={256} value={credential} onChange={(event) => setCredential(event.target.value)} aria-describedby={setup ? 'auth-hint' : undefined} autoFocus />
          {setup && <><p id="auth-hint" className="field-hint">Use pelo menos 12 caracteres.</p><label className="field-label" htmlFor="dashboard-confirm">Confirmar senha</label><input id="dashboard-confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{setup ? 'Criar senha e entrar' : 'Entrar no ateliê'}</button>
        </form>}
        {setup && !status?.setupAllowed && <p className="auth-explanation">O primeiro acesso precisa ser configurado no servidor antes de abrir o painel pela internet.</p>}
        {!status && <>{error && <p className="form-error" role="alert">{error}</p>}<button className="button secondary" onClick={() => void check()}>Tentar conexão novamente</button></>}
        <p className="auth-footnote"><ShieldCheck size={15} />Acesso reservado às suas viagens.</p>
      </>}
    </section>
  </main>;
}
