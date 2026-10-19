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

## Evidência de validação

Testes usam mídia técnica isolada, inclusive um MP4 esparso com o tamanho esperado, para verificar arquivo grande sem depender de peers ou consumir 3,76 GB físicos. Exercitam autenticação, disco insuficiente, rejeição de torrent alterado, ausência de duplicação, pausa/retomada, reinício, Range, leitura por FFprobe, edição real por FFmpeg e preservação de créditos/licença no MP4. O navegador verifica os controles, progresso, entrada no editor, exportação, créditos e largura móvel.

```sh
node --test test/nrk.test.mjs
npm run build
CHROMIUM_NO_SANDBOX=1 npm run test:nrk
```

Esses testes **não comprovam obtenção do vídeo NRK real**. O torrent foi obtido na pesquisa anterior; na tentativa de 19/10/2026 deste ambiente, o acesso HTTPS à NRK retornou 403 pelo proxy e não há acesso P2P autorizado nem sessão administrativa no Pod. O download real deve ser conferido no Pod após a atualização. Preserve o proxy do ambiente Codex; não tente contornar suas restrições.

Validação em 19/10/2026: **65/65** testes da suíte geral passaram, assim como build, navegador NRK e navegador do editor existente. Os parâmetros de aria2 foram conferidos no manual oficial; o binário e a conectividade BitTorrent ainda precisam ser exercitados no Pod. Nenhuma captura do teste técnico representa uma viagem NRK já obtida.
