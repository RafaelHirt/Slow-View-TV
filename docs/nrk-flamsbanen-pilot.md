# Primeira viagem completa: Flåmsbanen

O painel Netlify aciona uma transferência no RunPod existente. O navegador não envia 3,76 GB e o arquivo não passa pelas funções Netlify. Nenhum Pod adicional é criado. A transferência só começa ao clicar em **Trem → Flåmsbanen → Baixar viagem no RunPod**.

## Fonte e licença

- [Publicação oficial NRK](https://nrkbeta.no/2010/09/03/last-ned-flaamsbana-i-2d-og-3d/), consultada em 19/10/2026: Myrdal → Flåm, versão 2D Full HD.
- Arquivo descrito pelo torrent: `flamsbanen.hele.turen.1920x1080.h264.Nrk.mp4`, **3.763.728.590 bytes**.
- [Torrent oficial](https://nrkbeta.no/torrent/Flamsbanen.hele.turen.1920x1080.h264.NRK.torrent). SHA-256 dos metadados obtidos na pesquisa: `31c95678c89a16bd1d65abfe73a14f93193038aeb2c007a432db00e01b758475`; info hash: `218fafb2d888ad44e217f13e96c722bf4fd83920`.
- [CC BY-SA 3.0 Noruega](https://creativecommons.org/licenses/by-sa/3.0/no/). A publicação exige crédito NRK, links na descrição online, indicação das alterações e distribuição das adaptações sob as condições da licença. O texto menciona tanto `http://nrkbeta.no/` quanto `http://nrkbeta.no/bergensbanen`; ambos são preservados no crédito, além da página específica da Flåmsbanen.

O conteúdo aceito continua sendo apenas esse vídeo. O torrent oficial mantém a verificação de SHA-256. Depois da tentativa sem transferência, o usuário forneceu o [endereço exato do espelho Nytsoi](https://trainfulness.nytsoi.net/torrents/flamsbanen.hele.turen.1920x1080.h264.Nrk.mp4.torrent), que passou a ser a fonte consultada ao retomar. Antes de acionar aria2, o servidor exige arquivo único, nome idêntico, **3.763.728.590 bytes**, partes de **262.144 bytes** e SHA-256 da lista completa de hashes de partes **`d2ef10b5c5c66468c716b00e0c9c056be3971f517b789626de2e33caa8f67326`**, conferido contra os metadados oficiais já obtidos. Também exige torrent público, sem fontes HTTP adicionais e sem nomes alternativos ou links de arquivo. Não modifica o campo privado do torrent oficial.

Um info hash diferente é esperado quando o publicador altera os metadados de privacidade; isso só é aceito se o conteúdo descrito coincidir integralmente. O endereço é fixo no servidor. Links arbitrários, caminhos e opções de shell não podem ser enviados pelo painel. Falha na consulta ou na conferência encerra a tentativa antes do P2P e preserva os arquivos existentes. Não há retorno automático ao torrent privado que já ficou sem transferência. Isso é uma autorização condicionada à validação no Pod, **não uma afirmação de que o espelho foi obtido ou que tem peers**.

## Atualizar o Pod existente

No terminal que mantém a aplicação aberta, use **Ctrl+C** para encerrar aquele processo. Mantenha o Nginx e os dados existentes. No mesmo terminal root do RunPod:

```sh
cd /workspace/Slow-View-TV &&
git switch main &&
git pull --ff-only origin main &&
apt-get update &&
apt-get install -y aria2 &&
npm ci &&
npm run build &&
PORT=3000 MEDIA_NRK_DOWNLOADS=1 CORS_ORIGINS='https://slow-view-tv.netlify.app,https://2lbjqxjuruepcp-3001.proxy.runpod.net' npm run start:footage
```

Reutiliza `DASHBOARD_PASSWORD` do Pod e o volume persistente. Não cole a senha no chat nem em variáveis `VITE_*`. Se este for um Pod novo sem Node/dependências, execute antes `bash scripts/runpod-setup.sh`; o instalador também inclui aria2. O Node escuta em 3000; o Nginx continua dono da porta pública 3001.

Depois de a aplicação iniciar, atualize a página do painel e abra **Trem**. A opção fica indisponível enquanto o backend estiver antigo, o recurso estiver desativado ou aria2 estiver ausente. Para conferir sem depender do deploy Netlify, abra o mesmo painel pelo [HTTP Service do Pod](https://2lbjqxjuruepcp-3001.proxy.runpod.net/).

## Transferência e retomada

- Reserve aproximadamente **6 GB livres** para o original e a primeira amostra. O original é renomeado para a biblioteca no mesmo volume; não é duplicado pelo importador.
- As partes e o arquivo de retomada ficam em `SLOWVISTA_DATA_DIR/footage/nrk/flamsbanen/`. Arquivos prontos ficam em `SLOWVISTA_DATA_DIR/footage/`. Não apague nem mova esses caminhos durante a transferência.
- Ao trocar o info hash, o controle `.aria2` anterior é renomeado para `.aria2.preserved-<identificador>`. O vídeo parcial permanece no mesmo lugar. aria2 confere as partes já presentes antes de continuar; o primeiro retorno pode demorar enquanto lê o disco. Retomadas seguintes com o mesmo torrent mantêm o novo controle normalmente. `source.torrent` antigo é preservado; a fonte ativa fica em `active-source.torrent`.
- O painel mostra bytes recebidos, pausa e retomada. Pode ser fechado enquanto o servidor continua ligado. Pausar preserva as partes; reiniciar o servidor exige clicar em **Retomar**, sem início automático.
- Cada tentativa tem limite de uma hora e encerra após 180 segundos consecutivos sem transferência. Há limites de velocidade de 20 MiB/s de download e 512 KiB/s de upload; não mantém seeding após concluir. O servidor precisa de conectividade BitTorrent para os peers, além do acesso HTTPS à NRK.
- **Não há garantia de peers ativos.** Falta de fontes não significa falha de login ou que a aplicação precisa de outra GPU. O painel informa a falha e preserva as partes para uma nova tentativa.
- O arquivo só fica pronto depois de aria2 concluir e conferir as partes, não haver controle de transferência pendente, o tamanho coincidir e FFprobe reconhecer vídeo 1920×1080 válido. A presença de faixa de áudio continua sem provar som audível.

## Primeira amostra

Ao concluir, **Abrir viagem e preparar amostra** leva ao editor com o original, a origem, os créditos e a licença. Assista antes de escolher o trecho; comece com **60–90 segundos** sem cortes internos e som original, se houver. Confira se há som audível e se corresponde à filmagem. Não substituir o ambiente por sons atribuídos indevidamente à viagem.

O MP4 de uma adaptação CC BY-SA registra a licença e os créditos também nos metadados. **Baixar créditos** fornece o texto com links para a descrição da publicação. Esse texto deve acompanhar a distribuição; metadados não substituem os créditos visíveis/descrição exigidos pela fonte. Materiais próprios, CC0 ou da mesma licença podem compor a adaptação neste fluxo; outras combinações precisam de análise de compatibilidade.

O mapa e o modelo do trem ainda não estão confirmados. Não há posição animada inventada, restauração por IA, transmissão YouTube ou promessa de monetização nesta etapa.

## Tentativa real interrompida em 0% e próxima consulta

O usuário confirmou o painel atualizado na Netlify, a execução da importação no Pod e a mudança de **Baixando → Download pendente** após cerca de três minutos, com zero bytes registrados. Esse intervalo corresponde ao encerramento após 180 segundos sem transferência. A mensagem antiga agrupava todas as saídas não nulas do aria2; não comprova ausência de peers nem identifica o código daquela tentativa.

A inspeção dos metadados originais confirmou `private=1` na Flåmsbanen e na Bergensbanen; a versão de verão sincronizada da Nordlandsbanen examinada não tem esse campo. O campo controla descoberta de peers, não a licença de reutilização nem a senha do painel. Torrents privados dependem dos rastreadores e não usam DHT para descobrir fontes. Não foi confirmada a saúde desses rastreadores no Pod.

O novo código registra duração, código de saída, máximos de conexões/fontes completas quando informados pelo programa, falhas de rastreador e códigos numéricos. Distingue problemas de armazenamento, DNS, opções inválidas e transferência incompleta. Descarta os logs brutos para não expor IPs, caminhos ou credenciais de proxy. A migração preserva bytes e a mensagem da tentativa anterior; os detalhes novos só serão registrados em uma tentativa executada pelo backend atualizado.

Para consultar fontes sem parar a aplicação, abra **outra aba do terminal do Pod**:

```sh
cd /workspace/Slow-View-TV &&
git pull --ff-only origin main &&
npm run check:nrk-sources
```

O comando não abre o banco, não lê a senha, não baixa vídeo, não inicia P2P e não altera a biblioteca. Reutiliza o torrent oficial já obtido no Pod, conferindo seu SHA-256 e info hash. Consulta diretamente o endereço Nytsoi informado pelo usuário, mesmo se a página de índice falhar. `directMirror.contentMatchesOfficial` compara os hashes com a referência fixada; `importEligible` também exige as condições acima. Esses campos não demonstram disponibilidade do vídeo.

O verificador anterior procurava apenas links no domínio `blog.nytsoi.net`; o arquivo está em `trainfulness.nytsoi.net`. Esse erro de descoberta foi corrigido. O relatório agora distingue `metadataAvailable`, `pageFetched` e a consulta HTTP ao rastreador, apresenta links de outros hosts para revisão e reconhece magnets sem iniciar P2P. Não confundir página acessível com vídeo disponível. O espelho é citado por um leitor nos comentários da [publicação NRK de 2018](https://nrkbeta.no/2018/02/13/hva-skjedde-med-bittorrent/) e não é hospedagem oficial.

A consulta ao rastreador registra apenas se recebeu resposta HTTP e o status; uma resposta pode vir de um proxy e não prova que o vídeo esteja disponível. O relatório resultante não contém senha nem logs brutos. O painel passa a identificar a fonte usada, a possibilidade de descoberta DHT e a reconferência dos dados anteriores.

## Evidência de validação

Testes usam mídia técnica isolada, inclusive um MP4 esparso com o tamanho esperado, para verificar arquivo grande sem depender de peers ou consumir 3,76 GB físicos. Exercitam autenticação, disco insuficiente, rejeição de torrent alterado, ausência de duplicação, pausa/retomada, reinício, Range, leitura por FFprobe, edição real por FFmpeg e preservação de créditos/licença no MP4. O navegador verifica os controles, progresso, entrada no editor, exportação, créditos e largura móvel.

```sh
node --test test/nrk.test.mjs
npm run build
CHROMIUM_NO_SANDBOX=1 npm run test:nrk
```

Esses testes **não comprovam obtenção do vídeo NRK real**. O torrent foi obtido na pesquisa anterior; na tentativa de 19/10/2026 deste ambiente, o acesso HTTPS à NRK retornou 403 pelo proxy e não há acesso P2P autorizado nem sessão administrativa no Pod. O download real deve ser conferido no Pod após a atualização. Preserve o proxy do ambiente Codex; não tente contornar suas restrições.

Validação inicial em 19/10/2026: **65/65** testes da suíte geral passaram, assim como build, navegador NRK e navegador do editor existente. Após o relato, os testes específicos foram ampliados para subprocessos com falha, pausa e migração de diagnósticos, e inspeção/comparação de torrents. O navegador também confere a exibição dos contadores.

aria2 **1.37.0** real foi obtido de pacotes Debian com verificação APT, extraído em diretório temporário e executado localmente: a mesma lista de opções foi aceita ao inspecionar o torrent oficial; uma transferência HTTP exclusivamente em localhost validou as linhas reais de progresso. Isso não exercita trackers nem peers externos. Na pesquisa deste ambiente, o HTTPS NRK recebeu HTTP 403, o espelho teve CONNECT 403 do proxy e a consulta HTTP ao rastreador recebeu 403; não extrapolar esses resultados para a rede do Pod. Nenhum vídeo NRK real foi recebido no ambiente Codex.

A atualização do espelho foi testada com metadados técnicos inventados: aceita partes idênticas sob outro info hash; rejeita conteúdo, nomes, torrents privados e fontes HTTP não conferidos; preserva o vídeo e o controle anterior na troca. Um aria2 real também conferiu um arquivo técnico já existente e concluiu sem alterá-lo, com DHT, LPD e troca de peers desativados e sem rastreadores. Isso verifica a retomada por integridade, não o espelho ou peers reais. O endereço exato Nytsoi também recebeu CONNECT 403 neste ambiente; sua obtenção e validação reais continuam a depender da execução no Pod.
