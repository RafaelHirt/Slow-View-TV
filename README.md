# Slow View TV Studio

Ateliê para reunir **filmagens reais**, selecionar trechos e preparar MP4s com imagem e áudio suaves. Interface em português, reprodução iniciada por você e player sem distrações.

Repositório do projeto: [RafaelHirt/Slow-View-TV](https://github.com/RafaelHirt/Slow-View-TV). A marca pública é **Slow View TV**. Nomes internos de banco, variáveis e do checkout existente permanecem compatíveis com a primeira versão.

**Foco atual:** importar vídeos e sons com fonte e licença registradas, editar um trecho contínuo e assistir com controle de volume e pausa opcional. Consulte [o fluxo de filmagens reais](docs/real-footage.md) para uso, implantação e limites. A busca integrada no Pexels é opcional e requer uma chave privada no servidor; sem ela, a biblioteca recebe arquivos enviados pelo usuário. Nenhum catálogo de filmagens reais vem pré-carregado.

O protótipo procedural anterior foi preservado em `/prototype`, com seus dados e produções. Ele usa cenários ilustrativos e não reconstrói a paisagem real. As seções sobre GPX, atlas e renderização 3D abaixo documentam esse protótipo.

## Filmagens reais

- Biblioteca de MP4/WebM e áudio MP3/WAV, com origem, créditos, licença e conferência de direitos.
- Envio de arquivos ou importação de links diretos dos CDNs Pexels/Pixabay. Busca Pexels quando configurada; links de páginas e do YouTube não são arquivos importáveis.
- Seleção de um trecho de 3 segundos a 1 hora; exportação H.264 na cadência original em HD, Full HD ou 4K, sem ampliar a fonte.
- Entrada e saída suaves, áudio original nivelado, faixa ambiente opcional ou silêncio; créditos preservados por edição.
- Reprodução sem autoplay, player sem distrações, volume inicial baixo e pausa automática opcional.
- Processamento FFmpeg na CPU. Chromium e GPU são necessários somente para o antigo fluxo 3D.

Em desenvolvimento, use `npm run dev`. Para build e execução local, `npm run build` e `npm start`; configure `DASHBOARD_PASSWORD` privadamente para entrar. No Pod já preparado, `npm run start:footage` inicia apenas a edição real na porta interna 3000, atrás do Nginx 3001. Neste piloto, manteremos a API e o processamento no RunPod existente, com o painel na Netlify, sem contratar outro servidor. Desligar o Pod também interrompe o acesso à biblioteca e aos arquivos; separar o catálogo do processamento é uma evolução posterior.

Há uma amostra real curta para importação voluntária na biblioteca vazia, com fonte e licença para conferência. O [guia do primeiro teste](docs/pilot-real-footage.md) registra o material, os limites e a ordem de atualização do Pod e da Netlify.

## Arquivo do protótipo 3D

- Importação GPX com um único segmento contínuo, até 12 MB e 100.000 pontos; rejeição de coordenadas inválidas, múltiplos segmentos e percurso sem distância.
- Banco SQLite persistente de rotas e versões. Cada versão guarda nome, estação do ano, horário, clima, duração, temperatura simulada opcional e exibição do mapa.
- Prévia Three.js com câmera seguindo cada segmento do traçado; nenhuma curva spline corta as curvas do GPX. A ausência de elevações completas resulta em prévia nivelada, sem inventar altitudes.
- Mapa do traçado sincronizado, sem mapas-base externos. O arquivo original precisa ter precisão suficiente para a rota pretendida; o aplicativo não valida se os pontos pertencem a uma ferrovia ou estrada real.
- Atlas mundial com países locais Natural Earth, camada online de infraestrutura OpenRailwayMap e consulta regional de relações ferroviárias OSM. Clique numa rota do catálogo para ver as atmosferas salvas e abrir sua configuração.
- Integração Overpass para procurar, inspecionar e importar relações `route=train`. A geometria só é aceita se formar um percurso contínuo: bifurcações, lacunas, geometrias ausentes e sentidos incompatíveis exigem revisão. Fonte, data e atribuição são preservadas. O catálogo não representa todos os serviços do mundo; GTFS e validação de operação ainda não foram integrados.
- Exportação MP4 H.264 nativa em 1280×720, 1920×1080 ou 3840×2160, a 24 fps, por Chromium e FFmpeg. O canvas e o vídeo são verificados na resolução pedida, sem ampliar 720p para 4K. Cada viagem percorre a rota uma vez. A duração escolhida define a velocidade média; não há simulação de trânsito, paradas, limites de velocidade ou dinâmica ferroviária.
- Teste de oito segundos à velocidade configurada, sem acelerar o percurso inteiro. Renderização completa configurável de um minuto a doze horas, fila serial, progresso, cancelamento e download.
- Identificação de viagem virtual no vídeo; temperatura, quando exibida, é explicitamente simulada. Percursos demonstrativos têm identificação adicional.
- Interface responsiva, acesso protegido por senha, player de vídeo no painel com suporte a HTTP Range e downloads com autorização limitada. Links locais de anexos da conversa dependem de outro visualizador; abrir `index.html` isoladamente não executa o aplicativo.

Em **Produções**, quando a coleção estiver vazia, **Assistir à demonstração 4K** abre o teste técnico de dois segundos incluído em `public/demos/` e servido pelo próprio aplicativo. Ele é uma maquete ilustrativa de diagnóstico, não o vídeo final de Viena–Praga. A reprodução dentro da ferramenta não depende do visualizador de anexos da conversa.

## Revisão visual offline opcional

As pastas `artifacts/` e `review/` são saídas locais de revisão, ignoradas pelo Git; **não estão presentes em um clone novo**. A apresentação criada durante esta sessão reuniu capturas reais, abas, ampliação de imagens e o MP4 4K de dois segundos em um arquivo autocontido. Os controles das telas capturadas são imagens; essa apresentação não edita o catálogo nem produz novos vídeos. Capturas e MP4 históricos ainda podem mostrar a marca da versão anterior.

Para abrir o **aplicativo completo por um endereço web**, use [o guia de implantação](docs/deployment.md). A apresentação offline é apenas uma alternativa de revisão; publicar `review/index.html` não conecta o banco nem a API.

`npm run review` só funciona **depois** de preparar os arquivos esperados em `artifacts/`: `slowvista-world.png`, `slowvista-editor.png`, `slowvista-demo-player.png`, `slowvista-atlas-mobile.png` e `slowvista-4k-test.mp4`. As capturas foram preparadas nesta sessão e nem todas são geradas automaticamente pelos testes. O comando apenas empacota esses arquivos em `review/index.html`; não é uma etapa de instalação ou implantação do aplicativo.

Na apresentação desta sessão, navegação, ampliação, reprodução e layout móvel foram validados via HTTP local com Chromium. O navegador gerenciado bloqueou a abertura `file://`; esse teste específico não passou aqui, e nenhuma política foi contornada.

## Executar

Para o template RunPod PyTorch/Ubuntu 24.04, consulte [o instalador e o guia do piloto](docs/runpod-pilot.md). O guia inclui volume persistente, diagnóstico gráfico e conexão da API ao site Netlify. O procedimento ainda requer validação no Pod real.

Requisitos: Node.js 24+, npm, Chromium e FFmpeg com encoder `libx264`. O navegador local precisa suportar WebGL. Nesta máquina, os executáveis estão em `/usr/bin/chromium` e `/usr/bin/ffmpeg`.

```sh
cd /workspace/SlowVista
npm ci
npm run build
npm start
```

O servidor oferece o painel e a API na porta 3001. Em desenvolvimento, `npm run dev` inicia a API na porta 3001 e o Vite na porta 5173 com proxy de API. O comando de desenvolvimento está escrito para shells Unix. O programa usa o checkout existente; não é necessário criar worktrees para tarefas neste ambiente isolado.

Neste ambiente gerenciado, o teste de inicialização do Chromium confirmou que seu helper SUID não está configurado. Para permitir a exportação **nesta máquina**:

```sh
CHROMIUM_NO_SANDBOX=1 npm start
# Ou, durante desenvolvimento:
CHROMIUM_NO_SANDBOX=1 npm run dev
```

O padrão em outras instalações mantém o sandbox. O navegador de exportação só pode carregar o aplicativo local; solicitações a origens externas são bloqueadas. Se o Chromium estiver em outro caminho, configure `CHROMIUM_EXECUTABLE`.

As opções estão em `.env.example`. O servidor carrega `.env` quando existir; não coloque credenciais no Git. Para a primeira execução local nenhuma chave de IA, mapa ou serviço externo é necessária.

## Senha de acesso

Configure `DASHBOARD_PASSWORD` no ambiente privado do servidor antes de abrir o painel: use de 12 a 256 caracteres. O catálogo permanece bloqueado até existir uma credencial. Não existe senha padrão e a criação de senha por HTTP fica desativada, inclusive em localhost, para impedir que um proxy exponha a configuração inicial. O bootstrap HTTP está disponível somente mediante opção explícita no código dos testes e mantém as verificações de Host, Origin e conexão locais.

Para hospedar na internet, configure `DASHBOARD_PASSWORD` no ambiente privado do servidor antes de iniciar. Uma senha já configurada também permanece disponível no mesmo banco persistente. Uma interface pública recusa iniciar sem credencial configurada. Use HTTPS e `CORS_ORIGINS` com a origem exata do painel; senha e token nunca pertencem a variáveis `VITE_`.

A senha é guardada como hash scrypt com salt aleatório; as sessões também são guardadas somente como hash. Cada login emite uma sessão aleatória válida por 12 horas, mantida em `sessionStorage` pelo painel. **Sair** revoga essa sessão no servidor. Cinco tentativas inválidas por conexão de origem bloqueiam novas tentativas por 15 minutos; cabeçalhos de proxy não alteram essa contagem.

`ADMIN_TOKEN` continua disponível como alternativa legada, incluindo compatibilidade com Bearer direto. No painel, o login com essa chave emite uma sessão revogável. Alterar `DASHBOARD_PASSWORD` e reiniciar o servidor atualiza a senha persistida e revoga as sessões anteriores; remover a variável depois não apaga o hash já configurado. Para recuperar o acesso, defina uma nova senha por essa variável privada e reinicie. Não edite nem compartilhe o banco para distribuir credenciais.

## Primeira viagem

1. No **Explorar mundo**, navegue no mapa, clique numa rota já salva para ver suas versões ou consulte relações OSM numa área pequena. A camada **Trilhos do mundo** é online. Em **Minhas rotas**, use **Nova rota** para importar um GPX próprio com coordenadas reais. Há uma demonstração no painel e um arquivo fictício em `examples/demonstracao.gpx` para aprender o fluxo; ambos não representam uma viagem real verificada.
2. Dê nome à rota e escolha trem, carro ou caminhada.
3. Crie uma atmosfera, por exemplo, “Inverno de manhã”, escolha condições e salve.
4. Altere o horário e salve como outra versão. As versões anteriores permanecem no banco.
5. Explore a prévia e gere o teste de oito segundos.
6. Escolha 4K UHD, Full HD ou HD para a viagem completa. Em **Produções**, acompanhe o progresso, assista no próprio painel e baixe o MP4. Confira o resultado antes de iniciar a viagem completa. O teste rápido padrão usa 720p; o motor aceita testes em 4K pela API.

Os arquivos ficam em `data/slowvista.sqlite` e `data/videos/`, ignorados pelo Git. Catálogo, notas, sessões e produções do usuário não são publicados no repositório; uma instalação nova cria seu próprio banco. Dados sobrevivem ao fechamento do navegador e reinicialização do servidor. Para backup consistente, encerre o servidor e copie a pasta `data/` inteira. Use disco persistente ao hospedar o servidor. Uma única instância deve controlar esse banco e sua fila.

## Processamento de vídeos longos

O limite de doze horas configura a linha do tempo; não comprova que um servidor conseguirá renderizar esse tempo dentro de um prazo ou orçamento específico. A exportação percorre quadro a quadro com apenas um quadro em memória por vez. Não há repetição artificial do vídeo para preencher a duração e não há cobrança de API de geração nesta edição.

Uma exportação de duas horas a 24 fps exige 172.800 quadros e espaço para o MP4. O renderizador desta versão usa screenshots PNG sequenciais e pode ser bem mais lento que o tempo real. Uma fila é processada por vez. Fechar o painel não interrompe o trabalho, desde que o servidor continue ligado; reiniciar o servidor marca as produções ativas como interrompidas. Não há retomada por checkpoints nesta edição.

Validação realizada: build e testes automatizados; fluxo no navegador com duas versões de 120 minutos salvas, atlas, configurações por rota, player e download; exportação efetiva de oito segundos em 720p e de dois segundos da cena 3D em **3840×2160 nativo, 24 fps, 48 quadros**. O teste 4K levou **147,3 segundos** no renderizador por software desta máquina; não mede o desempenho de uma GPU. Uma renderização completa de duas horas ainda não foi executada. Na velocidade observada, a renderização por software não é adequada ao prazo de produção de viagens longas; precisamos de um worker com GPU, benchmark representativo e possivelmente outro motor para fidelidade fotográfica.

`CHROMIUM_GPU_MODE=native` permite ao Chromium usar o driver instalado; não cria GPU, não comprova aceleração e não resolve o realismo visual. O padrão `software` torna o teste reproduzível neste ambiente. Resolução, fidelidade geográfica e qualidade visual são requisitos separados.

## Acesso às fontes ferroviárias

O mapa-base de países funciona sem serviços externos. A camada ferroviária e a consulta exigem:

- `a.tiles.openrailwaymap.org`: imagens de referência da infraestrutura, com créditos OSM/OpenRailwayMap.
- `overpass-api.de`: relações e geometrias OSM consultadas pelo backend com proxy, limites, cache e timeout.

Após a liberação de rede, o teste mais recente da camada OpenRailwayMap retornou HTTP 200. A consulta ao Overpass terminou por tempo limite; acesso ao domínio não confirma uma consulta concluída nem a geometria de uma viagem. A integração também foi testada com fixtures explicitamente ilustrativas; nenhum traçado Viena–Praga foi inventado para contornar a ausência de dados verificados. Relatos de bloqueios anteriores em documentos de revisão são registros históricos, não o estado atual da conexão.

O primeiro planejamento **Viena → Praga** foi salvo no banco privado desta sessão, aguardando traçado ferroviário verificado. Ele não é distribuído como uma rota pronta em instalações novas. Consulte [as limitações de cada fonte](docs/source-review.md) e [o contrato da integração](docs/railway-data.md).

## GitHub, Netlify e servidor

O projeto está preparado para **Netlify hospedar o painel**, com `netlify.toml`. A API, o banco persistente e o renderizador precisam de um servidor de longa duração com Chromium, FFmpeg e disco. Funções efêmeras do Netlify não são usadas como renderizador ou armazenamento SQLite.

No Netlify, importe [RafaelHirt/Slow-View-TV](https://github.com/RafaelHirt/Slow-View-TV), selecione a branch **`main`**, comando **`npm run build`**, pasta publicada **`dist`** e Node **24**. Configure `VITE_API_BASE_URL` antes do build para apontar à API HTTPS realmente hospedada. Somente publicar o frontend não disponibiliza o catálogo nem o renderizador. Os passos de servidor, senha, DNS e verificação estão em [docs/deployment.md](docs/deployment.md).

Para separar painel e servidor:

1. Hospede este projeto num servidor Linux, instale dependências, rode `npm run build` e mantenha `npm start` em execução com volume persistente.
2. Configure `HOST=0.0.0.0`, uma `DASHBOARD_PASSWORD` privada e `CORS_ORIGINS` com a origem HTTPS exata do painel. A API recusa inicializar numa interface pública sem senha ou credencial legada configurada. Proteja o endereço público com HTTPS no proxy de entrada.
3. No build do Netlify, configure `VITE_API_BASE_URL` com a origem HTTPS pública da API. Essa URL é pública; nunca coloque o token em variáveis `VITE_`.
4. Abra o painel e entre com sua senha. A sessão fica em `sessionStorage` e é enviada pelo cabeçalho Authorization; a senha não é embutida nos arquivos publicados.
5. O servidor mantém uma cópia local de `dist` e o trabalhador carrega `/render` nessa cópia por loopback. A página de renderização sempre usa a API local, mesmo se o painel tiver sido compilado com uma URL pública.

Esta é uma ferramenta de administração de um único catálogo, sem contas por usuário. Enviar o código ao GitHub não hospeda a API nem configura os domínios e as variáveis no Netlify.

## Verificar

```sh
npm run build
npm test
# Navegador real, banco isolado, download e ffprobe:
CHROMIUM_NO_SANDBOX=1 npm run test:e2e
# Atlas, versões por rota, confirmação 4K, player HTTP e falha de fonte:
CHROMIUM_NO_SANDBOX=1 npm run test:atlas
# Exportação efetiva da cena em 4K nativo, 2 segundos:
CHROMIUM_NO_SANDBOX=1 npm run test:4k
```

Os testes de navegador usam bancos temporários e não toca na coleção do usuário. Capturas e MP4 de teste vão para `test-results/`, ignorado pelo Git. Os testes de integração que usam um renderizador simulado verificam fila e autenticação; o teste de navegador exporta de fato a cena Three.js com Chromium e FFmpeg.

## Evolução para paisagem fiel

O catálogo e suas variações serão reutilizados nas próximas etapas. Para atingir a meta de viagens longas que reflitam o lugar real, falta integrar fontes licenciadas de terreno/edificações, composição de vegetação ancorada em referências reais, túneis/pontes/estações, materiais e iluminação de maior qualidade, áudio coerente e revisão comparativa com cada rota. O desempenho de renderização e a continuidade precisam ser validados num percurso representativo antes da produção de horas de vídeo. IA pode auxiliar na criação dos elementos; nenhum modelo genérico substitui esses dados de referência.
