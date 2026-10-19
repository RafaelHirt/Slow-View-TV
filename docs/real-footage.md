# Filmagens reais no Slow View TV

O foco mudou para editar material filmado, com controle de reprodução e de áudio. O cenário 3D anterior permanece em `/prototype`; não faz parte deste novo fluxo e não é uma filmagem real. Os dados antigos permanecem no banco.

Para a divisão entre dashboard, editor, player, CPU/GPU e fornecedores de conteúdo, consulte [a proposta de produto e produção](product-and-production.md). Mapas, legendas e montagem de vários clipes são evoluções propostas; não fazem parte do editor entregue nesta etapa.

A aba **Trem** apresenta Nordlandsbanen, Flåmsbanen e Bergensbanen, com origem/destino, fonte e condições de uso. A Flåmsbanen tem importação pelo servidor com progresso, pausa/retomada e associação persistente ao arquivo; depende de ativação no Pod e de fontes ativas do torrent oficial. As outras viagens continuam em preparação. Não há mapa sincronizado nem obtenção do vídeo real comprovada pelos testes locais. Veja [como iniciar a primeira viagem](nrk-flamsbanen-pilot.md).

## Primeiro vídeo

1. Abra a biblioteca. Na biblioteca vazia, **Preparar importação da amostra** preenche os dados de uma filmagem real de trem na neve, de cerca de 26 segundos. O arquivo 720p tem faixa AAC, mas está sem som audível, confirmado por medição integral do original e da edição. A fonte é Pexels, não NRK; percurso e modelo do trem permanecem não identificados. A importação exige sua conferência e não começa automaticamente. Veja [o guia do teste](pilot-real-footage.md). Também pode usar os atalhos do Pexels ou Pixabay para procurar outra filmagem.
2. Assista à fonte e confira as condições de edição e publicação na página original. Um vídeo disponível na internet não implica autorização de reutilização. A biblioteca registra a declaração do criador, sem certificar a licença automaticamente.
3. Baixe o arquivo autorizado e use **Adicionar material**. Informe título, fonte, autor, licença e condições relevantes. Também é possível guardar um material ainda não conferido; a exportação exige a conferência.
4. Em **Assistir e editar**, selecione início e fim em segundos. Esta versão exporta um único trecho contínuo; ainda não monta vários clipes numa linha do tempo.
5. Escolha som original, uma faixa ambiente enviada em MP3/WAV, ou silêncio. O MP4 recebe entrada e saída de até 1,5 segundo e, quando há áudio, nivelamento para -22 LUFS, pico alvo -2 dBTP e fades. Isso não remove sons repentinos, falas ou música da gravação. Revise o resultado antes de publicar. Uma faixa ambiente curta é repetida e a emenda deve ser ouvida.
6. Exporte, assista e baixe MP4 e créditos. O player sem distrações inicia pausado, com volume baixo e temporizador opcional. Não há reprodução do próximo vídeo, alertas sonoros nem trilha acrescentada automaticamente.

A primeira amostra permite avaliar o fluxo com um trecho de 20 segundos antes de preparar uma versão longa. É um teste de edição, sem avaliação de conforto concluída, sem tratamento com IA e sem mapa sincronizado. Nenhum arquivo é incluído automaticamente no catálogo do usuário.

## Fontes online

Sem configuração adicional, os botões de busca abrem os sites das fontes. Importação automática por link aceita apenas arquivos HTTPS em `videos.pexels.com` e `cdn.pixabay.com`, incluindo redirecionamentos dentro dessa lista. Para outras fontes, envie o arquivo. Links do YouTube são referências; não há extrator de YouTube nesta versão.

A busca integrada no Pexels requer `PEXELS_API_KEY`, configurada como segredo do **backend**. Nunca use uma variável `VITE_` para essa chave. A chave é enviada somente à API Pexels, sem aparecer no painel, nas URLs dos arquivos ou nos créditos. A busca traz até 12 resultados horizontais e prefere o arquivo em 1080p disponível. O usuário abre a fonte, revisa e prepara a importação; não há coleta automática em massa.

Destinos HTTPS necessários no servidor: `api.pexels.com` para busca; `videos.pexels.com` e `cdn.pixabay.com` para arquivos. As páginas `www.pexels.com` e `pixabay.com` servem à conferência manual das fontes. O cliente HTTP respeita `HTTPS_PROXY`/`HTTP_PROXY`, TLS e uma lista fixa de CDNs.

No ambiente Codex houve bloqueios iniciais às fontes. Na pesquisa posterior, NRKbeta, Creative Commons e Pexels responderam HTTP 200; consulte [as fontes verificadas](verified-media-sources.md). A importação de um arquivo real Pexels e sua exportação de 20 segundos passaram pelo backend com FFmpeg. A busca pela API continua sem verificação real, pois a chave não foi configurada. A suíte automatizada comum usa padrões de imagem e tons declarados como fixtures técnicas; o teste real separado está em `npm run review:footage`.

## Execução e atualização

Requisitos do fluxo real: Node.js 24+, FFmpeg/FFprobe com libx264, dependências npm e disco persistente. Não é necessário Chromium em execução nem GPU. A interface existente de senha e CORS permanece em uso.

Local:

```sh
npm ci
npm run build
npm start
```

Configure `DASHBOARD_PASSWORD` no ambiente privado do servidor. `npm start` oferece API e painel na porta 3001 por padrão. Para desenvolvimento, `npm run dev` oferece API em 3001 e Vite em 5173. As credenciais não pertencem ao repositório.

No **Pod já preparado**, primeiro encerre o servidor anterior com Ctrl+C no terminal que o iniciou. Depois que esta versão estiver disponível no repositório:

```sh
cd /workspace/Slow-View-TV
git pull --ff-only
npm ci
npm run build
PORT=3000 npm run start:footage
```

Esse comando reutiliza o usuário `slowview`, a senha privada e `/workspace/slow-view-tv-data`, verifica FFmpeg/FFprobe e os locks do banco, e desativa a fila de renderização 3D. No template atual, o Nginx escuta em 3001 e encaminha para Node em 3000; não encerre o Nginx. Depois atualize o build do painel Netlify. A variável pública `VITE_API_BASE_URL` permanece apontando para a base HTTPS do serviço, sem `/api/health`.

Atualize primeiro o backend e depois o painel: um painel novo não encontra os endpoints de biblioteca num backend antigo. Este documento não indica que o site ou o Pod já foram atualizados. O piloto usa o RunPod existente; não exige contratar outro servidor. Desligá-lo também interrompe a API, a biblioteca e os vídeos. Uma API permanente em CPU e GPU por tarefa são evoluções posteriores, depois de validar o conteúdo.

## Limites e dados

- Envio/importação padrão de até 512 MB por arquivo; `MEDIA_MAX_UPLOAD_MB` ajusta o limite até 10240 MB, conforme o disco e o proxy disponíveis.
- A Flåmsbanen usa um importador específico no servidor, com tamanho oficial fixado em 3,76 GB e conferência de espaço; não exige aumentar o limite de envio do navegador. Requer aria2 e `MEDIA_NRK_DOWNLOADS=1`. Torrent e credenciais não são enviados em campos de importação genéricos.
- Fontes com duração conhecida de 1 segundo a 12 horas. Trechos de 3 segundos a 1 hora. MP4/WebM, MP3/WAV; HDR é recusado para evitar alteração silenciosa de cores.
- Exportação H.264 em 1280×720, 1920×1080 ou 3840×2160, preservando os timestamps e a cadência da fonte, a proporção e barras quando necessárias. Resoluções que ampliariam a fonte são recusadas. Não há IA de melhoria, reconstrução de detalhes ou geração de som. Fontes entrelaçadas ainda exigem preparação e revisão específicas.
- Uma edição é processada por vez. Importações têm limite de duas transferências simultâneas. O tempo depende da CPU, resolução e duração. Não há benchmark de uma hora nem garantia de desempenho em 4K.
- Biblioteca e saídas em `SLOWVISTA_DATA_DIR/footage/`; tabelas novas no mesmo SQLite. Reiniciar o servidor marca envios e edições incompletos como interrompidos. Não há retomada de upload ou exportação.
- A transferência NRK preserva partes e permite retomada manual, inclusive após reinício. Isso não acrescenta retomada aos uploads pelo navegador ou às exportações FFmpeg.
- Arquivos exigem sessão ou um link temporário limitado àquele arquivo. Esses links permitem reprodução e HTTP Range; expiram e mudam após reiniciar o servidor. Créditos da edição são uma cópia dos dados da fonte no momento da exportação.
- Use uma instância por banco, backup consistente com o serviço encerrado e espaço suficiente para originais mais saídas. Os originais usados em edições são preservados.

## Verificação

```sh
npm test
npm run build
CHROMIUM_NO_SANDBOX=1 npm run test:footage
```

O último override é específico ao Chromium de teste deste ambiente gerenciado. O editor em produção não usa Chromium para processar filmagens. Os testes exercitam direitos pendentes, mídia inválida, limite de bytes, links privados, redirecionamentos, corte real, áudio, fades, download, acesso e layout móvel. Não substituem a avaliação humana do conforto do conteúdo.
