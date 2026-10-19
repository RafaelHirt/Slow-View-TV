# Piloto no RunPod

Este procedimento prepara **o protótipo atual**: API, SQLite, fila e renderizador no mesmo Pod. Não provisiona uma máquina automaticamente. O cenário continua ilustrativo, o encoder usa CPU e a exportação ainda não inclui áudio. A instalação completa no template e a aceleração NVIDIA precisam ser verificadas no Pod real.

## Configuração mostrada no console

| Campo | Escolha para o piloto |
| --- | --- |
| Template | Runpod PyTorch 2.8.0, base Ubuntu 24.04, CUDA 12.8 |
| Imagem observada | `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404` |
| Nome do Pod | `slow-view-tv-pilot` |
| GPU | Uma RTX 4090, 24 GB VRAM |
| Recursos associados mostrados | 31 GB RAM, 8 vCPU |
| Cobrança | On-Demand; a imagem mostra US$ 0,89/h de GPU |
| Container disk | 30 GB temporários para sistema e instalações |
| Armazenamento | Network volume, inicialmente 100 GB |
| Nome do volume | `slow-view-tv-data` |
| Montagem | `/workspace` |

Selecione um data center em que a RTX 4090 esteja disponível. O **Network volume** tem capacidade fixa e continua existindo após excluir o Pod; excluí-lo é uma ação separada. O preço mostrado de US$ 0,07/GB/mês corresponde a aproximadamente US$ 7/mês para 100 GB, além de GPU e eventuais outros itens. Confira o resumo final da contratação. Global volume está indicado como beta na imagem; Volume disk legado é vinculado ao Pod.

100 GB servem como ponto de partida do piloto. Viagens completas podem exigir mais espaço: duas horas de vídeo a 35–60 Mb/s ocupam aproximadamente 31,5–54 GB, além dos dados do cenário e caches.

## Antes de iniciar a máquina

Nas configurações do template/Pod:

- Exponha a porta **3001 como serviço HTTP**. O proxy do RunPod fornecerá um endereço HTTPS para ela.
- Defina **`DASHBOARD_PASSWORD` por um Secret do RunPod**, com 12–256 caracteres. Não coloque seu valor no Git, na Netlify, no histórico de comandos ou na conversa.
- Defina `CORS_ORIGINS=https://slow-view-tv.netlify.app`.
- Defina `NVIDIA_DRIVER_CAPABILITIES=all` para solicitar também as bibliotecas gráficas do driver. A disponibilidade delas depende do host; CUDA sozinho não comprova WebGL acelerado.
- Preserve o comando inicial do template para poder abrir seu terminal. A preparação abaixo não depende de Jupyter ou de modelos PyTorch.

O instalador e os comandos abaixo estão no repositório. O primeiro teste pago pode ser iniciado depois de revisar essa configuração; ele deve começar por instalação e diagnóstico, antes de qualquer renderização longa.

## Preparação no terminal do Pod

Execute no terminal Linux do Pod, inicialmente como root:

```bash
cd /workspace
git clone https://github.com/RafaelHirt/Slow-View-TV.git
cd /workspace/Slow-View-TV
bash scripts/runpod-setup.sh
```

Se o checkout já existir, entre nele. O instalador não apaga, reinicializa ou atualiza silenciosamente seus arquivos: revise mudanças locais antes de usar `git pull --ff-only`.

A preparação confirma Ubuntu 24.04 e a montagem de `/workspace`, instala FFmpeg, fornece Node.js 24 quando necessário e verifica seu pacote com SHA-256 do manifesto oficial. Executa `npm ci`, instala dependências e o Chromium fornecido pelo Playwright, evitando o pacote Snap de Chromium do Ubuntu. O build é executado sem a senha do painel no ambiente.

Cria o usuário `slowview` e os diretórios:

| Diretório | Conteúdo |
| --- | --- |
| `/workspace/Slow-View-TV` | Código, dependências e build |
| `/workspace/slow-view-tv-data` | Catálogo, notas, sessões e vídeos |
| `/workspace/slow-view-tv-browser` | Chromium do Playwright |
| `/workspace/slow-view-tv-cache` | Cache npm |

Antes de instalar as dependências, testa criação, escrita, renomeação, leitura e remoção como `slowview` nesses diretórios. Alguns volumes do RunPod mostram proprietário fixo `0:0` e modo `777`, recusando `chown`; o instalador dispensa a troca de proprietário quando o acesso efetivo funciona. Ele não aplica `chmod 777` nem executa o aplicativo como root. Em sistemas com permissões POSIX normais, ajusta o proprietário somente se necessário e restringe o diretório de dados. Um volume que mantém modo `777` não isola arquivos entre usuários locais: mantenha este piloto em Pod/volume exclusivo do aplicativo.

Se uma versão anterior parou com `chown: Operation not permitted`, atualize o checkout com `git pull --ff-only` (após conferir mudanças locais) e execute `bash scripts/runpod-setup.sh` novamente. O erro posterior de Playwright ausente indica que a instalação foi interrompida; só execute o diagnóstico de GPU depois de aparecer **Preparação concluída**.

Dados e navegador ficam fora do checkout, no volume persistente. O sistema, a instalação global de Node e o usuário Linux podem precisar ser recriados após parar/recriar o contêiner; nesse caso execute a preparação novamente. Ela não inicia o aplicativo automaticamente. `bash scripts/runpod-setup.sh --plan` apenas descreve as ações, sem instalar nada.

## Verificar gráficos e iniciar

```bash
npm run gpu:check:runpod -- --require-nvidia
```

O wrapper executa o programa como `slowview`, sem colocar a senha em argumentos ou arquivos. O sandbox do Chromium permanece ativo por padrão. Se houver erro concreto de sandbox no contêiner isolado, avalie explicitamente `CHROMIUM_NO_SANDBOX=1`; o instalador não o habilita automaticamente.

O diagnóstico inspeciona a identidade WebGL do navegador. `nvidiaRenderer: true` indica que o contexto observado usa NVIDIA; não mede velocidade nem muda o encoder. `softwareRenderer: true` indica uma implementação como SwiftShader. O modo pedido `native` sozinho não demonstra aceleração. A opção `--require-nvidia` retorna código 2 quando a NVIDIA não é identificada.

O modo `native` solicita `--enable-gpu`, necessário para a descoberta de hardware no Chromium sem interface. Em Linux sem tela X11, pode ser necessário selecionar ANGLE/Vulkan explicitamente. Teste esse perfil no Pod isolado em que a falha de sandbox já foi observada:

```bash
CHROMIUM_NO_SANDBOX=1 CHROMIUM_GPU_BACKEND=vulkan npm run gpu:check:runpod -- --require-nvidia
```

O resultado informa `backend` solicitado, `sandboxEnabled` e o renderer observado. Se esse perfil identificar NVIDIA, mantenha **o mesmo `CHROMIUM_GPU_BACKEND=vulkan`** na inicialização da API, junto da decisão explícita sobre o sandbox. Teste e renderizador compartilham as opções gráficas. Se Vulkan continuar sem hardware, confira as bibliotecas/ICD do driver; `nvidia-smi` acessível como `slowview` comprova acesso à placa, mas não a presença da pilha gráfica. Não reinstale o driver do host dentro do contêiner.

Referência: [documentação do Chromium sobre GPU no modo headless](https://github.com/chromium/chromium/blob/main/docs/gpu/using-gpu-hardware-in-headless-chrome.md). As opções permitem testar a configuração; ainda é necessário obter e conferir o resultado real no Pod.

Se `vulkaninfo --summary` falhar com `Could not get vkCreateInstance ... libGLX_nvidia.so.0`, confira o carregador genérico `libEGL.so.1`, além da biblioteca de fornecedor `libEGL_nvidia.so.0`. O instalador inclui explicitamente `libegl1`, pois as dependências do navegador podem omiti-lo. Um [relato no projeto NVIDIA para Ubuntu 24.04 e driver 580](https://github.com/NVIDIA/nvidia-container-toolkit/issues/1952) registra essa causa. Em um Pod já preparado, execute `apt-get install -y libegl1` e repita `vulkaninfo` como `slowview`. A instalação desse pacote não comprova que todo erro de driver foi resolvido; confira o resultado real antes de repetir o diagnóstico do navegador.

Depois de conferir o diagnóstico, inicie a API:

```bash
npm run start:runpod
```

Quando o perfil Vulkan acima tiver sido validado no mesmo Pod, use em vez disso:

```bash
CHROMIUM_NO_SANDBOX=1 CHROMIUM_GPU_BACKEND=vulkan npm run start:runpod
```

O comando de início valida senha, permissões, FFmpeg/libx264 e um teste básico de exclusão de escrita entre processos no volume. Para este piloto, SQLite usa journal DELETE e lock EXCLUSIVE, em vez de WAL com memória compartilhada. Mantenha **um único processo/Pod** usando esse banco. O teste não certifica a durabilidade nem o comportamento de falhas de todo sistema de arquivos de rede; valide persistência e faça backup antes de usar dados importantes. Para produção, prefira a API permanente com armazenamento de banco adequado e GPU separada.

Ao fechar o terminal ou parar o processo, a API pode ficar indisponível. Esta etapa é um piloto supervisionado, sem supervisor ou reinício automático. Não deixe uma GPU ligada apenas para manter o catálogo acessível.

## Ligar a Netlify

No RunPod, abra a conexão HTTP da **porta 3001** e copie o endereço HTTPS real fornecido. Não use `localhost`, não acrescente `/api` e não inclua senha.

Na Netlify, configure:

```dotenv
VITE_API_BASE_URL=ENDERECO_HTTPS_REAL_DA_PORTA_3001
```

O valor acima é um marcador: substitua-o pelo endereço copiado e gere um novo deploy. `DASHBOARD_PASSWORD` permanece exclusivamente no servidor/Secret do Pod. Não altere `APP_ORIGIN` para a URL da Netlify: o renderizador abre a cópia local do aplicativo.

Antes de produzir vídeos, confira: `/api/health` retorna JSON, o login funciona pelo site, notas permanecem após reiniciar a API e um teste curto é reproduzido no painel. Inicie com uma demonstração identificada como ilustrativa. Não apresente esse teste como uma viagem real de Viena–Praga.

Ao desligar o Pod, o endereço da API deixa de atender. O volume continua sujeito à cobrança e não é um backup independente. Excluir o volume apaga seu conteúdo; preserve os dados antes dessa ação.
