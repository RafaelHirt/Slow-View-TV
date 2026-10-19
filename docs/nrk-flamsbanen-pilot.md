# Primeira viagem completa: Flåmsbanen

O painel Netlify aciona uma transferência no RunPod existente. O navegador não envia 3,76 GB e o arquivo não passa pelas funções Netlify. Nenhum Pod adicional é criado. A transferência só começa ao clicar em **Trem → Flåmsbanen → Baixar viagem no RunPod**.

## Fonte e licença

- [Publicação oficial NRK](https://nrkbeta.no/2010/09/03/last-ned-flaamsbana-i-2d-og-3d/), consultada em 19/10/2026: Myrdal → Flåm, versão 2D Full HD.
- Arquivo descrito pelo torrent: `flamsbanen.hele.turen.1920x1080.h264.Nrk.mp4`, **3.763.728.590 bytes**.
- [Torrent oficial](https://nrkbeta.no/torrent/Flamsbanen.hele.turen.1920x1080.h264.NRK.torrent). SHA-256 dos metadados obtidos na pesquisa: `31c95678c89a16bd1d65abfe73a14f93193038aeb2c007a432db00e01b758475`; info hash: `218fafb2d888ad44e217f13e96c722bf4fd83920`.
- [CC BY-SA 3.0 Noruega](https://creativecommons.org/licenses/by-sa/3.0/no/). A publicação exige crédito NRK, links na descrição online, indicação das alterações e distribuição das adaptações sob as condições da licença. O texto menciona tanto `http://nrkbeta.no/` quanto `http://nrkbeta.no/bergensbanen`; ambos são preservados no crédito, além da página específica da Flåmsbanen.

O servidor aceita apenas esse torrent previamente conferido e verifica seu SHA-256 antes de acionar aria2. Links arbitrários, caminhos e opções de shell não podem ser enviados pelo painel. Mudança no torrent exige revisão da fonte, não desativação do checksum.

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

O comando não abre o banco, não lê a senha, não baixa vídeo, não inicia P2P e não altera a biblioteca. Reutiliza o torrent oficial já obtido no Pod, conferindo seu SHA-256 e info hash. Consulta também um espelho citado por um leitor nos comentários da [publicação NRK de 2018](https://nrkbeta.no/2018/02/13/hva-skjedde-med-bittorrent/) e compara tamanho, tamanho das partes e todos os hashes de partes com o arquivo oficial. O espelho não é oficial nem está aprovado para importação automática. Uma igualdade dos dados comprova equivalência do conteúdo descrito, não a presença de peers ativos.

A consulta ao rastreador registra apenas se recebeu resposta HTTP e o status; uma resposta pode vir de um proxy e não prova que o vídeo esteja disponível. O relatório resultante não contém senha nem logs brutos. Se houver candidato equivalente e público, revisar seu endereço e checksum antes de integrá-lo.

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
