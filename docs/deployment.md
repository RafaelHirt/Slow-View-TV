# Abrir o Slow View TV por um endereço web

Configuração proposta para revisão. O aplicativo ainda não foi publicado; não há servidor contratado, credenciais de implantação ou GPU provisionada nesta tarefa.

## Arquitetura desta versão

```text
Navegador → painel HTTPS no Netlify
          → API HTTPS no servidor Linux
                         ├─ SQLite e vídeos em disco persistente
                         └─ fila e renderizador locais (Chromium + FFmpeg)
```

API, banco, fila e renderizador ainda são um processo/conjunto na mesma máquina. Um worker remoto RunPod não está conectado ao projeto. Para revisar o painel e administrar o catálogo, uma VPS DigitalOcean com **2 vCPU, 4 GB RAM e 80 GB SSD persistente** é um ponto de partida; esse perfil não é indicado para produzir horas em 4K. Um usuário administra um único catálogo, protegido por senha.

## 1. Servidor da API

Prepare um servidor Linux com Node.js 24, npm, Chromium e FFmpeg com `libx264`. Instale o projeto, por exemplo em `/opt/slowvista`, com um usuário de serviço dedicado e sem privilégios de administrador. Nesse checkout:

```sh
npm ci
npm run build
```

Mantenha `dist/` no servidor: o renderizador abre a cópia local de `/render`, mesmo quando o painel público está no Netlify.

Configure as variáveis do **servidor**, por exemplo em `/etc/slowvista.env`, legível somente pelo administrador e pelo usuário do serviço. Substitua os endereços pelos domínios efetivamente criados:

```dotenv
HOST=127.0.0.1
PORT=3001
APP_ORIGIN=http://127.0.0.1:3001
SLOWVISTA_DATA_DIR=/var/lib/slowvista
CORS_ORIGINS=https://seu-site.netlify.app
CHROMIUM_EXECUTABLE=/usr/bin/chromium
FFMPEG_EXECUTABLE=/usr/bin/ffmpeg
CHROMIUM_GPU_MODE=software
```

Acrescente **`DASHBOARD_PASSWORD`**, uma senha exclusiva de **12 a 256 caracteres**, pelo gerenciador de segredos do servidor ou no arquivo protegido. Não coloque o valor no Git, no Netlify, em variáveis `VITE_`, em comandos registrados no histórico ou na conversa. A senha permite o primeiro acesso público. O cadastro de senha por HTTP fica desativado por padrão, inclusive em localhost.

Crie `/var/lib/slowvista` no volume persistente e dê ao usuário do serviço permissão de escrita. O banco fica em `slowvista.sqlite`; os MP4 ficam em `videos/`. O diretório também guarda os dados auxiliares do catálogo. Use **uma instância** do aplicativo para esse banco. Para backup consistente, encerre o serviço e copie o diretório completo.

Exemplo de unidade `/etc/systemd/system/slowvista.service`, depois de criar o usuário `slowvista`, instalar os pré-requisitos e preencher o arquivo de ambiente:

```ini
[Unit]
Description=Slow View TV Studio
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=slowvista
Group=slowvista
WorkingDirectory=/opt/slowvista
Environment=NODE_ENV=production
EnvironmentFile=/etc/slowvista.env
ExecStart=/usr/bin/node server/index.mjs
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
```

Confirme o caminho do Node instalado antes de usar `ExecStart`. O padrão mantém o sandbox do Chromium; não copie `CHROMIUM_NO_SANDBOX=1` deste ambiente de teste para produção.

## 2. HTTPS da API

Crie um registro DNS, por exemplo `api.seu-dominio.com`, apontando para o servidor. Um proxy Caddy na mesma máquina pode oferecer o HTTPS e encaminhar para a API privada:

```caddyfile
api.seu-dominio.com {
    reverse_proxy 127.0.0.1:3001
}
```

No firewall, abra as portas necessárias para administração e **80/443**; mantenha 3001 sem acesso público. `HOST=127.0.0.1` é suficiente para esse proxy local. Se a hospedagem usar um proxy em outra máquina, será necessário ajustar a interface e limitar o acesso à porta interna. Use o endereço HTTPS real da API na próxima etapa.

## 3. Painel no Netlify

No Netlify, use **Add new project → Import an existing project → GitHub** e selecione [RafaelHirt/Slow-View-TV](https://github.com/RafaelHirt/Slow-View-TV), branch **`main`**. O repositório precisa conter o código antes do primeiro build. O `netlify.toml` já define Node, build e pasta publicada; acrescente a variável de build no painel do Netlify:

| Campo | Valor |
| --- | --- |
| Repositório | `RafaelHirt/Slow-View-TV` |
| Branch de produção | `main` |
| Node | `24` |
| Comando de build | `npm run build` |
| Pasta publicada | `dist` |
| Variável de build | `VITE_API_BASE_URL=https://api.seu-dominio.com` |

`VITE_API_BASE_URL` é um endereço **público**, sem `/api` no final e sem senha. A aplicação acrescenta `/api` às chamadas. Configure essa variável no Netlify e faça um novo build após alterá-la. O servidor precisa ter `CORS_ORIGINS` com a origem HTTPS exata do painel, sem barra final. Para mais de uma origem autorizada, separe por vírgulas; não use `*`.

O fallback SPA atual (`/*` → `/index.html`) permanece correto. Não é necessário acrescentar proxy `/api` quando a URL pública da API é configurada no build. Sem essa URL, o Netlify devolveria HTML para as chamadas de API; o painel informa **“O painel não encontrou a API do ateliê neste endereço. A hospedagem do painel precisa estar conectada ao servidor.”** em vez de exibir uma tela vazia.

Ao abrir o site publicado, entre com a senha configurada no servidor. Não existe cadastro público. A sessão fica na aba do navegador; o catálogo e os vídeos ficam no servidor. Ao trocar `DASHBOARD_PASSWORD` e reiniciar a API, sessões anteriores são revogadas.

## 4. Conferir antes de compartilhar o endereço

1. `https://api.seu-dominio.com/api/health` deve retornar JSON com `ok: true` e `authRequired: true`.
2. `https://api.seu-dominio.com/api/auth/status` deve retornar `mode: "password"` e `authenticated: false` sem login; `/api/routes` deve retornar HTTP 401.
3. Abra o painel Netlify: a tela de senha deve aparecer. Entre e confirme acesso ao atlas, ao catálogo e ao player do teste técnico 4K.
4. Verifique que não há erro CORS nem chamada à API por HTTP. Uma URL Netlify de prévia é outra origem; autorize-a explicitamente apenas se for usá-la.
5. Salve uma configuração de rota, reinicie o serviço e confira se ela continua no catálogo. Reiniciar interrompe exportações ativas; ainda não existe retomada por checkpoints.

Essas verificações confirmam o acesso e a persistência. Não comprovam o cenário real Viena–Praga nem a produção de horas de vídeo.

## GPU: próxima implantação, depois do painel

O piloto proposto é uma **RTX 4090 de 24 GB no RunPod**, com CPU, RAM e volume persistente adequados, para medir uma exportação representativa. Disponibilidade, preço e prazo de renderização ainda precisam ser confirmados. Não há contratação automática.

Nesta versão, o primeiro benchmark usará uma cópia isolada da aplicação completa na máquina GPU; separar o worker da API permanente exige uma adaptação posterior. Não compartilhe um arquivo SQLite entre máquinas. `CHROMIUM_GPU_MODE=native` apenas permite o driver gráfico; é necessário confirmar que o navegador usa a GPU. O encoder atual continua sendo `libx264` na CPU. O protótipo não tem driver, imagem RunPod ou motor fotorealista validados.

O acesso ao painel não depende dessa etapa de GPU. Armazenamento de objetos, como Spaces/S3, também será integração posterior; hoje os vídeos são servidos do disco persistente da API.
