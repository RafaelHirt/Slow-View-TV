# Dados ferroviários

O explorador consulta **relações de itinerário ferroviário** `type=route`,
`route=train` do OpenStreetMap. Essas relações não são o inventário de todos os
trilhos nem de todos os serviços de trem. A cobertura e a qualidade dependem dos
colaboradores OSM. Uma linha visível na camada OpenRailwayMap não significa que
exista uma relação de itinerário importável.

## API

O servidor mantém a integração em `server/railway.mjs`, montada em
`/api/railway`. A autenticação é a mesma das outras rotas da API.

- `GET /status`: última observação local da fonte (`unchecked`, `ready` ou
  `unavailable`). Um servidor inicializado não significa fonte acessível.
- `GET /routes?bbox=sul,oeste,norte,leste`: até 40 relações com nome, origem,
  destino, referência, operadora e centro. `truncated` pede uma busca menor.
- `GET /relations/:id`: geometria completa dos membros, metadados, atribuição,
  data da base e diagnóstico de continuidade.
- `POST /import`, corpo `{"relationId":123,"name":"Nome opcional"}`: salva a
  rota apenas quando os trilhos formam um único percurso contínuo. Retorna uma
  rota normal do Studio. Importar a mesma relação novamente reutiliza a rota
  existente, sem substituir as variações salvas.

O exemplo de identificador acima descreve o formato da requisição; não é uma
recomendação de relação real. A rota Viena–Praga precisa de relação e traçado
verificados antes da importação.

## Continuidade e limites

`server/railway-geometry.mjs` usa nós OSM compartilhados quando disponíveis.
Sem identificadores de nós, permite somente coordenadas exatamente iguais.
Orienta os trechos conectados e respeita papéis `forward` e `backward`.
Plataformas e paradas não são trilhos de percurso.

Geometria ausente, bifurcações, segmentos repetidos, sentidos incompatíveis,
relações aninhadas e grupos desconectados impedem a importação. **Não há
aproximação por linha reta nem descarte silencioso de trechos.** Relações que
agregam os dois sentidos ou ramais podem precisar de preparação manual.

A continuidade topológica não confirma horários, a operação atual, estações de
origem/destino, velocidade, elevação ou aparência da paisagem. OSM fornece a
base do traçado; o cenário 3D continua ilustrativo até receber dados geográficos
e visuais próprios. A API não inventa altitudes para a ferrovia.

Limites atuais:

- Região de busca até 4 graus quadrados, com cada dimensão até 4 graus.
- 40 resultados por busca; até 100.000 pontos por rota importada.
- Respostas da fonte até 20 MB; tempo limite de 30 segundos.
- Cache em memória de 5 minutos para buscas, 1 hora para geometria e 15 segundos
  para falhas. Nenhum resultado parcial é tratado como percurso completo.

O endpoint externo é fixo em `https://overpass-api.de/api/interpreter`. Não há
URL externa fornecida pelo navegador. O cliente usa o proxy HTTP/HTTPS herdado,
quando presente, com verificação TLS ativa e sem seguir redirecionamentos.
Um bloqueio de rede aparece como fonte indisponível e precisa ser resolvido nas
configurações do ambiente; o serviço não tenta contornar a política.

## Atribuição e validação

Dados: **© OpenStreetMap contributors, ODbL 1.0**.
Consulte <https://www.openstreetmap.org/copyright>. O identificador da relação,
link de origem, data da base quando informada e atribuição são preservados na
rota salva. Produtos derivados e outras camadas têm obrigações próprias; a
camada de mapa não concede licença para imagens, relevo ou vídeo de terceiros.

`node --test test/railway.test.mjs` valida a topologia, os limites, os estados de
erro, o cache, o contrato HTTP e a persistência SQLite com **fixtures
ilustrativas**. Esses testes não confirmam acesso externo nem a fidelidade de
uma rota real.
