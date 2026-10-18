import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Rebuild an offline review of actual captured screens and the existing MP4.
// This snapshot intentionally has no backend, external requests, or generation UI.
const root = fileURLToPath(new URL('../', import.meta.url));
const asset = async (name, type) => `data:${type};base64,${(await readFile(path.join(root, 'artifacts', name))).toString('base64')}`;
const [world, atlas, player, mobile, movie] = await Promise.all([
  asset('slowvista-world.png', 'image/png'),
  asset('slowvista-editor.png', 'image/png'),
  asset('slowvista-demo-player.png', 'image/png'),
  asset('slowvista-atlas-mobile.png', 'image/png'),
  asset('slowvista-4k-test.mp4', 'video/mp4'),
]);
const logo = `<svg width="40" height="44" viewBox="0 0 40 44" fill="none" aria-hidden="true"><rect x="1" y="1" width="38" height="42" rx="12" fill="#e4ebdf"/><path d="M10 32V18a10 10 0 0 1 20 0v14H10Z" stroke="#547763" stroke-width="1.6"/><circle cx="25" cy="17" r="3" fill="#c9b47a"/><path d="m10 27 8-6 12 8v3H10Z" fill="#8eaa91"/><path d="M20 25c12 4-10 3-2 8h8c-14-5 6-4-2-8" fill="#f9f7ef"/></svg>`;
const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="description" content="Revisão visual offline do Slow View TV Studio: telas reais capturadas e teste técnico de vídeo 4K.">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>Slow View TV Studio · revisão visual</title>
  <style>
    :root{--ink:#294539;--muted:#63765f;--green:#486f59;--line:#dbe2d2;--paper:#f7f7f0;--card:#fffef9;--soft:#edf1e5;--accent:#ad9662}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}button,a{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #a99563;outline-offset:4px}button{touch-action:manipulation}a{color:var(--green)}[hidden]{display:none!important}
    .shell{max-width:1480px;margin:auto;padding:28px 40px 32px}.top{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:22px;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:11px}.brand-name{font:27px/1 Georgia,serif;letter-spacing:-1px}.brand-sub{font-size:9px;letter-spacing:4px;margin-top:8px;color:var(--muted)}.edition{font-size:11px;text-align:right;color:var(--muted);letter-spacing:.5px}.dot{display:inline-block;height:7px;width:7px;border-radius:50%;background:#96ac82;margin-right:6px}
    .intro{margin:34px 0 25px;max-width:850px}.eyebrow{text-transform:uppercase;letter-spacing:2.5px;font-size:10px;font-weight:600;color:var(--muted)}h1{font:clamp(31px,4vw,46px)/1.14 Georgia,serif;letter-spacing:-1.3px;margin:12px 0 14px}p{margin:0 0 14px}.intro p{color:var(--muted);max-width:760px}.notice{border:1px solid var(--line);border-radius:8px;display:inline-flex;align-items:center;gap:9px;background:var(--soft);padding:9px 14px;font-size:12px;color:#52684b;margin-bottom:26px}.notice svg{flex:none}
    .layout{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:25px;align-items:start}.workspace{min-width:0}.tabs{display:flex;gap:5px;flex-wrap:wrap;margin:0 0 14px}.tab{border:1px solid transparent;padding:10px 14px;border-radius:7px;background:transparent;color:var(--muted);font-size:13px}.tab:hover{background:#e8eddf}.tab[aria-selected="true"]{background:var(--green);border-color:var(--green);color:#fff}.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}.panel-head{padding:19px 21px;border-bottom:1px solid var(--line)}.panel-head h2{font:24px/1.2 Georgia,serif;margin:0 0 7px;letter-spacing:-.4px}.panel-head p{font-size:12px;color:var(--muted);margin:0;max-width:750px}.badge{display:inline-block;background:var(--soft);border:1px solid var(--line);border-radius:50px;padding:3px 9px;margin-top:10px;font-size:10px;letter-spacing:.5px}.shot-button{display:block;border:0;background:#e9eee3;padding:0;width:100%;position:relative;line-height:0}.shot-button img{width:100%;height:auto;display:block}.shot-button::after{content:"Ampliar captura ↗";position:absolute;right:14px;bottom:14px;background:#fffef9ed;box-shadow:0 2px 15px #233e3220;border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:9px 11px;font-size:11px;line-height:1.4}.shot-button:hover::after{background:#fff}.caption{padding:13px 20px;font-size:11px;color:var(--muted);border-top:1px solid var(--line)}.mobile-shot{background:#e8ede1;padding:23px;display:flex;justify-content:center}.mobile-shot .shot-button{width:min(100%,390px);box-shadow:0 9px 30px #24463117;border-radius:10px;overflow:hidden}
    .video-shell{background:#16271f;line-height:0}video{width:100%;height:auto;aspect-ratio:16/9;display:block;background:#15241b}.video-caption{padding:17px 20px;background:#eef1e5;font-size:12px;color:#53654b}.video-caption strong{display:block;font-weight:600;color:var(--ink);margin-bottom:5px}.movie-actions{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:12px}.download{display:inline-flex;text-decoration:none;border:1px solid #bccbb2;background:#fffef9;border-radius:6px;padding:7px 11px;font-size:12px}.video-note{font-size:11px}.player-snapshot{padding:16px 20px;border-top:1px solid var(--line);font-size:12px}.player-snapshot summary{cursor:pointer;color:var(--green);padding:4px 0}.player-snapshot .shot-button{margin-top:14px;border:1px solid var(--line);border-radius:6px;overflow:hidden}
    aside{margin-top:59px}aside section{border-top:1px solid var(--line);padding:20px 0}aside section:first-child{padding-top:0;border-top:0}aside h2{font:22px/1.2 Georgia,serif;margin:0 0 15px;letter-spacing:-.4px}aside p{font-size:12px;color:var(--muted)}.check-list{padding:0;margin:0;list-style:none}.check-list li{font-size:12px;color:var(--muted);margin:0 0 16px;padding-left:20px;position:relative}.check-list li::before{content:"○";position:absolute;left:0;color:#95a783}.check-list strong{display:block;color:var(--ink);font-weight:500;font-size:13px;margin-bottom:3px}.status{font-size:10px;text-transform:uppercase;letter-spacing:1.8px;color:var(--muted);margin-bottom:10px}.next{background:#edf1e5;border:1px solid var(--line)!important;border-radius:9px;padding:17px!important}.next h2{font-size:20px}.next p:last-child{margin:0}.foot{display:flex;justify-content:space-between;gap:15px;border-top:1px solid var(--line);margin-top:30px;padding-top:16px;font-size:11px;color:var(--muted)}
    dialog{border:1px solid var(--line);padding:0;border-radius:10px;width:min(1500px,96vw);max-height:94vh;background:var(--paper);color:var(--ink)}dialog::backdrop{background:#172a21bd;backdrop-filter:blur(3px)}.dialog-head{padding:12px 16px;display:flex;gap:20px;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--paper);z-index:1;font-size:13px}.close{border:1px solid var(--line);border-radius:6px;background:var(--card);padding:6px 12px;color:var(--ink);font-size:12px}.dialog-image{display:block;width:100%;height:auto}.dialog-scroll{overflow:auto;max-height:calc(94vh - 61px)}
    @media(max-width:1050px){.shell{padding:22px}.layout{grid-template-columns:minmax(0,1fr) 215px;gap:19px}.tab{padding:9px 11px;font-size:12px}.intro{margin-top:28px}}
    @media(max-width:760px){.shell{padding:18px 14px 24px}.brand-name{font-size:23px}.edition{font-size:10px;max-width:125px}.top{padding-bottom:18px}.layout{grid-template-columns:1fr}.intro{margin:26px 0 20px}.intro p{font-size:13px}.notice{font-size:11px;display:flex;margin-bottom:21px;padding:10px 12px}.tabs{gap:5px}.tab{padding:9px 10px;flex:1 1 auto;white-space:nowrap}.panel-head{padding:17px}.panel-head h2{font-size:22px}.panel-head p{font-size:11px}.caption{padding:11px 15px}aside{margin-top:4px;display:grid;grid-template-columns:1fr 1fr;gap:20px}aside section{padding:0;border:0}aside section:last-child{grid-column:1/-1}.foot{display:block}.foot span{display:block;margin:3px 0}.mobile-shot{padding:15px}.shot-button::after{font-size:10px;bottom:8px;right:8px;padding:6px 8px}.video-caption{padding:14px}.player-snapshot{padding:12px 14px}}
    @media(prefers-reduced-motion:no-preference){.tab,.download{transition:background .15s ease}}
  </style>
</head>
<body>
<div class="shell">
  <header class="top"><div class="brand">${logo}<div><div class="brand-name">Slow View TV</div><div class="brand-sub">STUDIO</div></div></div><div class="edition"><span class="dot"></span>Revisão visual<br>Telas reais do protótipo</div></header>
  <main>
    <div class="intro"><div class="eyebrow">Seu ateliê de viagens tranquilas</div><h1>Uma primeira janela para o Slow View TV.</h1><p>Explore as telas que já construímos e assista ao teste técnico em 4K. Esta cópia abre diretamente no navegador, com todos os arquivos incluídos. As capturas e o vídeo abaixo são registros da versão anterior e ainda podem mostrar a marca SlowVista.</p></div>
    <div class="notice"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8" stroke="currentColor"/><path d="M10 9v5m0-9v1" stroke="currentColor" stroke-width="1.5"/></svg><span><strong>Demonstração visual</strong> · sem servidor · não gera novos vídeos</span></div>
    <div class="layout">
      <div class="workspace">
        <div class="tabs" role="tablist" aria-label="Explorar a demonstração">
          <button class="tab" id="tab-world" role="tab" aria-selected="true" aria-controls="panel-world" tabindex="0">Mapa mundial</button>
          <button class="tab" id="tab-atlas" role="tab" aria-selected="false" aria-controls="panel-atlas" tabindex="-1">Configurações da rota</button>
          <button class="tab" id="tab-video" role="tab" aria-selected="false" aria-controls="panel-video" tabindex="-1">Vídeo 4K</button>
          <button class="tab" id="tab-mobile" role="tab" aria-selected="false" aria-controls="panel-mobile" tabindex="-1">Celular</button>
        </div>
        <section class="panel" id="panel-world" role="tabpanel" aria-labelledby="tab-world" tabindex="0">
          <div class="panel-head"><h2>O mundo, no seu ritmo.</h2><p>Visão do atlas e do catálogo de viagens. Esta é uma captura da aplicação: os controles dentro da imagem não são interativos nesta cópia.</p><span class="badge">Captura real · mapa mundial</span></div>
          <button class="shot-button" data-title="Mapa mundial · captura real do protótipo" aria-label="Ampliar captura do mapa mundial"><img src="${world}" width="1440" height="1126" alt="Captura da versão anterior do aplicativo com mapa mundial em tons de verde e catálogo de rotas à direita."></button>
          <div class="caption">Clique na imagem para ampliar. O catálogo distingue o percurso de ensaio da rota Viena–Praga, ainda em preparação.</div>
        </section>
        <section class="panel" id="panel-atlas" role="tabpanel" aria-labelledby="tab-atlas" tabindex="0" hidden>
          <div class="panel-head"><h2>Uma rota, várias atmosferas.</h2><p>Editor de um percurso de ensaio com estação, horário, clima, duração e resolução do vídeo. É um conjunto de demonstração; não é o traçado ferroviário Viena–Praga.</p><span class="badge">Captura real · configurações salvas</span></div>
          <button class="shot-button" data-title="Configurações da rota · percurso de ensaio" aria-label="Ampliar captura das configurações da rota"><img src="${atlas}" width="1440" height="1440" alt="Editor da versão anterior do aplicativo com prévia 3D ilustrativa, opções de estação, horário, clima, duração e resolução 4K."></button>
          <div class="caption">A cena e o percurso são ilustrativos. Esta captura mostra o editor atual; os controles dentro dela não são editáveis nesta revisão visual.</div>
        </section>
        <section class="panel" id="panel-video" role="tabpanel" aria-labelledby="tab-video" tabindex="0" hidden>
          <div class="panel-head"><h2>Primeiros quadros em 4K.</h2><p>Um arquivo MP4 realmente renderizado em 3840 × 2160, a 24 quadros por segundo. Aperte o play para assistir, ou use tela cheia.</p><span class="badge">4K nativo · 2 segundos · MP4</span></div>
          <div class="video-shell"><video controls playsinline preload="metadata" aria-label="Teste técnico 4K: maquete ilustrativa de ferrovia, dois segundos, sem áudio"><source src="${movie}" type="video/mp4">Seu navegador não consegue reproduzir este MP4. Use o botão de download abaixo.</video></div>
          <div class="video-caption"><strong>Maquete ilustrativa, teste técnico de 2 segundos, sem áudio.</strong>Não representa Viena–Praga. Comprova a exportação em 4K; não demonstra fidelidade geográfica, fotorealismo ou renderização de uma viagem completa.<div class="movie-actions"><a class="download" href="${movie}" download="slowvista-teste-tecnico-4k-2s.mp4">Baixar MP4 4K ↓</a><span class="video-note">O vídeo está incluído neste arquivo. Não precisa de internet.</span></div></div>
          <details class="player-snapshot"><summary>Ver como o player aparece dentro do aplicativo</summary><button class="shot-button" data-title="Player do aplicativo · captura real" aria-label="Ampliar captura do player do aplicativo"><img src="${player}" width="1440" height="1492" alt="Tela Produções da versão anterior do aplicativo, exibindo o player do teste técnico 4K e controles de reprodução."></button></details>
        </section>
        <section class="panel" id="panel-mobile" role="tabpanel" aria-labelledby="tab-mobile" tabindex="0" hidden>
          <div class="panel-head"><h2>O ateliê também no celular.</h2><p>Captura da versão compacta da aplicação. Avalie o tamanho dos textos, a organização dos controles e o espaço dedicado ao mapa.</p><span class="badge">Captura real · tela móvel</span></div>
          <div class="mobile-shot"><button class="shot-button" data-title="Versão para celular · captura real" aria-label="Ampliar captura da versão para celular"><img src="${mobile}" alt="Captura da versão anterior para celular do atlas."></button></div>
          <div class="caption">A imagem preserva a versão móvel capturada, mesmo quando você abre esta demonstração em um computador.</div>
        </section>
      </div>
      <aside aria-label="Guia para avaliação">
        <section><h2>O que avaliar</h2><ul class="check-list"><li><strong>Identidade visual</strong>Cores, tipografia, tranquilidade e leitura das telas.</li><li><strong>Mapa e catálogo</strong>Como gostaria de explorar o mundo e encontrar suas viagens?</li><li><strong>Configurações</strong>Estação do ano, horário e clima estão organizados de um jeito claro?</li><li><strong>Imagem e sobreposição</strong>Posição e tamanho do mapinha e das informações sobre o vídeo.</li></ul></section>
        <section><div class="status">Primeira rota planejada</div><h2>Viena → Praga</h2><p>Viagem de trem. O percurso ferroviário verificado e o cenário correspondente ainda precisam ser integrados. As imagens do teste não pertencem a essa viagem.</p></section>
        <section class="next"><div class="status">Próximo passo</div><h2>Dados reais do cenário.</h2><p>Validar os trilhos, incorporar relevo e referências locais e medir o desempenho de renderização com GPU antes de produzir horas de vídeo.</p></section>
      </aside>
    </div>
  </main>
  <footer class="foot"><span>Slow View TV Studio · Quiet journeys. No talking.</span><span>Revisão offline · nenhuma chamada externa · nenhuma publicação automática</span></footer>
</div>
<dialog id="image-dialog" aria-labelledby="dialog-title"><div class="dialog-head"><span id="dialog-title">Captura ampliada</span><button class="close" type="button">Fechar ✕</button></div><div class="dialog-scroll"><img class="dialog-image" alt="" id="dialog-image"></div></dialog>
<script>
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function activate(tab, focus = false) {
    tabs.forEach(item => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; document.getElementById(item.getAttribute('aria-controls')).hidden = !selected; });
    if (tab.id !== 'tab-video') document.querySelector('video').pause();
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      let next = null;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== null) { event.preventDefault(); activate(tabs[next], true); }
    });
  });
  const dialog = document.getElementById('image-dialog');
  const expanded = document.getElementById('dialog-image');
  document.querySelectorAll('.shot-button').forEach(button => button.addEventListener('click', () => { const img = button.querySelector('img'); expanded.src = img.src; expanded.alt = img.alt; document.getElementById('dialog-title').textContent = button.dataset.title; dialog.showModal(); }));
  dialog.querySelector('.close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
</script>
</body>
</html>`;

const output = path.join(root, 'review', 'index.html');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html);
console.log(JSON.stringify({ output, bytes: (await stat(output)).size, assets: '4 PNG captures + 4K MP4, all embedded', network: 'none', generatesVideos: false }));
