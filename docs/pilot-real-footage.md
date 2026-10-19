# Primeiro teste com filmagem real

Decisão de 19/10/2026: manter o painel na **Netlify** e reutilizar o **RunPod existente** para API, SQLite, arquivos e FFmpeg. Não contratar outro servidor para este teste. O Pod precisa continuar ligado enquanto o painel usa sua API ou reproduz seus arquivos. Ainda não existe um catálogo independente que continue funcionando com o Pod desligado.

## Material do ensaio

- Fonte: [filmagem de trem na neve, shalender kumar / Pexels](https://www.pexels.com/video/a-train-travelling-through-the-railroad-in-the-snowy-mountain-of-himachal-in-india-3563086/).
- [Licença Pexels](https://www.pexels.com/license/) e página do item consultadas em 19/10/2026, HTTP 200. A licença permite uso gratuito e modificação, com restrições de redistribuição, cópias sem alterações, endosso e outros usos descritos na página.
- Arquivo 720p obtido do CDN oficial: **10.055.062 bytes**, duração FFprobe **25,92 s**, H.264 progressivo, **1280×720, 25 fps**, áudio AAC estéreo a 48 kHz.
- SHA-256 do arquivo obtido: `a516b8ecf2f62696d8296ea0d38e326524cc77a9509267b493dbb8f76c017fe9`.
- A fonte informa Himachal Pradesh, Índia. Origem, destino, modelo do trem e posição por tempo não estão confirmados. Não associar este clipe às viagens norueguesas da aba Trem nem inventar um mapa.
- O autor disponibiliza também uma versão 3840×2160. Para uma futura edição em 4K, avaliar essa fonte antes de ampliar 720p por IA. O ensaio usa 720p para transferir e processar pouco material.

Edição de teste: **20 segundos**, do segundo 2 ao 22, sem cortes internos, com áudio original, nivelamento e fades. Não é uma produção longa, tratamento por IA, aprovação de conforto ou promessa de monetização. O original é preservado para comparação. A avaliação editorial de movimento e sons repentinos ainda deve ser feita assistindo e ouvindo.

## Como testar no painel

1. Abra a biblioteca vazia e escolha **Preparar importação da amostra**.
2. Abra a página da fonte, confira a licença, marque a conferência e use **Adicionar à biblioteca**. Não há importação automática ao entrar no site e não é necessária uma chave Pexels para esse link direto.
3. Aguarde a importação e abra **Assistir e editar**. Escolha início **2**, fim **22**, som **original** e resolução **720p**.
4. Exporte e compare a fonte com o MP4. Em **Minhas edições**, experimente **Assistir sem distrações**, silêncio e temporizador. Não há reprodução automática.

O navegador envia as escolhas à API; o FFmpeg no RunPod produz o arquivo. O usuário não precisa abrir outro site para editar. Mapas e legendas continuam pendentes no novo fluxo.

## Atualização coordenada

O código foi preparado para a branch `feat/real-footage-pilot`. Atualize primeiro o Pod; o frontend Netlify deve ser publicado a partir da mesma versão depois de confirmar os endpoints novos. O painel antigo e seus dados permanecem disponíveis em `/prototype` na nova aplicação; a fila de renderização 3D fica desativada em `start:footage`.

No terminal que mantém o servidor antigo aberto, encerre **esse processo** com Ctrl+C. Em seguida:

```sh
cd /workspace/Slow-View-TV &&
git fetch origin &&
git switch feat/real-footage-pilot &&
git pull --ff-only &&
npm ci &&
npm run build &&
PORT=3000 CORS_ORIGINS='https://slow-view-tv.netlify.app,https://2lbjqxjuruepcp-3001.proxy.runpod.net' npm run start:footage
```

Reutiliza a senha privada e o volume existentes. Não encerra o Nginx nem ocupa sua porta 3001. Não usa Chromium para a edição. As duas origens HTTPS exatas permitem o painel Netlify e o teste temporário do painel servido pelo próprio Pod, sem liberar origens genéricas.

Para a primeira conferência, abra [o painel servido pelo Pod](https://2lbjqxjuruepcp-3001.proxy.runpod.net/) e entre com a senha já configurada. Confira `/api/health`, a biblioteca e a importação da amostra. Só depois publique a mesma versão no Netlify, mantendo `VITE_API_BASE_URL=https://2lbjqxjuruepcp-3001.proxy.runpod.net`.

Este guia não comprova que o Pod ou o site tenham sido atualizados. A sessão de administração e a credencial privada do Pod não estão disponíveis no ambiente Codex. Para voltar à versão anterior, encerre o novo servidor, use `git switch main`, restaure suas dependências/build e o comando antigo `start:runpod`. As tabelas novas são aditivas e os arquivos da biblioteca permanecem no volume.

## Teste reproduzível no ambiente de desenvolvimento

```sh
npm run review:footage
```

Usa um banco temporário separado e autenticação própria, consulta o CDN Pexels respeitando o proxy configurado, limita a importação a 20 MB e espera no máximo 90 segundos para o download e cinco minutos para a edição. Não conecta ao Pod do usuário nem altera seu catálogo. Salva original, MP4 editado, créditos e relatório em `artifacts/real-footage-pilot/`, fora do Git. Esse comando é uma verificação explícita com rede; a suíte comum continua usando fixtures técnicas declaradas.

Validação local em 19/10/2026: suíte completa **60/60**; build; navegador com login, aba Trem, dados da amostra sem confirmação automática de direitos, upload, edição, player, créditos, seeking, mobile e logout; e importação real Pexels com saída **20s/720p/25fps e áudio**. O tempo observado de preparação e obtenção dessa saída foi 132,7s na CPU do ambiente de desenvolvimento, concorrendo com outros checks. Não é um benchmark do RunPod nem uma medida de custo por vídeo. Mapas, restauração com IA, publicação Netlify e execução da nova versão no Pod não foram validados por esses testes.

## Onde a IA pode ajudar

O RunPod oferece o computador e formas de executar modelos; uma GPU ligada não modifica o vídeo sozinha. O primeiro candidato pesquisado é [Real-ESRGAN, repositório oficial](https://github.com/xinntao/Real-ESRGAN), que documenta restauração e ampliação de imagens e ferramentas de inferência. Não está instalado nem integrado neste piloto. Processamento quadro a quadro precisa ser avaliado também em movimento: detalhes inventados, excesso de suavização e cintilação podem prejudicar a filmagem.

Depois de aprovar a edição básica, selecionar dez a vinte segundos com um defeito concreto, guardar uma versão de controle e executar um único tratamento no RunPod. Comparar imagem, movimento, som, tempo e custo medido antes de incorporá-lo ao painel. Transcrição só é útil quando houver fala relevante; limpeza de voz não deve remover o ambiente do trem. O fluxo atual usa FFmpeg/libx264 na CPU, sem acelerar a exportação por GPU ou acrescentar sons artificiais.
