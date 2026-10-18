# Dados reais, simulação e limites das fontes

Revisão técnica em 18 de outubro de 2026. O objetivo é produzir viagens completas sobre traçados ferroviários documentados, com cenários cuja fidelidade possa ser avaliada por trecho. Resolução 4K, precisão do percurso e realismo visual são requisitos distintos.

## O que cada fonte fornece

| Fonte | Uso adequado | Limite que precisamos respeitar |
| --- | --- | --- |
| OpenStreetMap e Overpass | Obter vias férreas, relações de transporte, estações, edifícios e outros objetos mapeados. | Uma consulta `railway=rail` retorna uma rede: ramificações, pátios, sentidos e linhas paralelas precisam ser resolvidos. Uma etiqueta de operadora não substitui a seleção de um serviço e de sua data. Não há garantia de cobertura ou precisão topográfica uniforme. |
| OpenRailwayMap | Consultar visualmente a infraestrutura ferroviária baseada em OSM. | Não é garantia de exportação automática de qualquer viagem completa em uma única linha. A extração, conexão e validação do caminho precisam existir na nossa aplicação. |
| GTFS Schedule | Identificar viagens, paradas, calendário, horários e formas de trajeto quando disponíveis. | O GTFS não é um levantamento dos trilhos. Na especificação consultada, `shapes.txt` é **condicionalmente obrigatório**; isso não garante dados de alta precisão em todos os feeds existentes. GTFS Realtime é uma especificação separada, e a existência de uma API pública utilizável de cada operadora deve ser verificada. |
| Digitransit e Navitia | Planejar viagens nas regiões e bases de dados efetivamente carregadas pelo serviço contratado ou instalado. | Um software configurável para qualquer região não equivale a uma API pública com todos os serviços ferroviários do mundo. Nesta revisão, a documentação do Digitransit foi lida; a cobertura atual da Navitia não foi verificada. |
| ESA WorldCover | Classificar cobertura da terra e ajudar a distribuir categorias de cenário ao redor da ferrovia. | O produto de 2021 tem células de 10 m e 11 classes amplas. `Tree cover` não identifica espécie, coníferas, altura ou a posição de cada árvore. Não é uma descrição exata e atual de cada objeto. |
| Copernicus DEM e SRTM | Obter uma base de elevação para a paisagem. | Copernicus DEM é um modelo de superfície, incluindo construções e vegetação; não é automaticamente a cota do trilho. SRTM de cerca de 30 m cobre aproximadamente 56° S a 60° N. Pontes, túneis e cortes ferroviários exigem tratamento específico. |
| Cesium for Unreal | Integrar um globo georreferenciado, terreno, imagens e conteúdo 3D ao motor de renderização. | O plugin é aberto; conteúdo servido pode ter termos e custos separados. Dados globais não garantem fachadas, interiores de túneis ou vegetação detalhada na altura de uma cabine. |
| Google Earth Studio | Possível referência geográfica, sujeita aos termos aplicáveis. | Não é indispensável e não deve ser a base aprovada antes da revisão de licença para exportação, transformação por IA e uso comercial pretendido. Os termos atuais não puderam ser lidos nesta sessão. |

## Correções de projeto

- Rodovias A5, D1 e D2 não definem a geometria ferroviária Viena–Praga. Origem e destino também não definem sozinhos um caminho: selecionar serviço, paradas e data ajuda a distinguir itinerários e desvios. Um corredor de cidades pode orientar a busca, mas não deve ser rotulado como traçado verificado.
- Uma IA de vídeo para vídeo pode alterar trilhos, prédios e movimento, mesmo recebendo uma base 3D. Ela não oferece garantia de preservar geometria. Toda transformação precisa de validação temporal e visual.
- Hora de partida, duração, posição geográfica e data devem dirigir a evolução da luz. Um pôr do sol mantido por seis horas contradiz uma viagem comum em tempo real e deve ser uma escolha artística explícita.
- O catálogo mundial deve distinguir infraestrutura mapeada, itinerário candidato, traçado validado e cenário pronto. Exibir uma ferrovia no mapa não significa que ela já está pronta para renderizar.
- O Netlify hospeda o painel e pode encaminhar solicitações autenticadas. Renderizações longas devem rodar em trabalhadores externos com GPU quando necessário, fila, progresso persistido e armazenamento de objetos. Nenhum limite numérico de execução da Netlify foi confirmado nesta sessão.
- O sistema deve preservar créditos e licenças por conjunto de dados e recurso. OSM exige atribuição e, em certas derivações e distribuições de dados, obrigações de compartilhamento pela mesma licença; uma licença aberta não significa ausência de condições.

## Fontes efetivamente lidas

Os textos abaixo foram obtidos por HTTPS com verificação TLS e o proxy configurado do ambiente:

1. [README oficial do OpenRailwayMap](https://github.com/OpenRailwayMap/OpenRailwayMap/blob/master/README.md): descreve o projeto como mapa de infraestrutura baseado em OSM e lista website, estilos, regras de validação e API separada.
2. [Especificação GTFS Schedule](https://github.com/google/transit/blob/master/gtfs/spec/en/reference.md#shapestxt): descreve `shapes.txt`, sequência de pontos, relação com as viagens e requisito condicional. Foi lida a versão disponível na branch `master` nesta data, sem congelamento de commit.
3. [README oficial do Digitransit](https://github.com/HSLdevcom/digitransit/blob/master/README.md): solução configurável por região, baseada em OpenTripPlanner; apresenta exemplos na Finlândia.
4. [Catálogo WorldCover v200 no Earth Engine](https://github.com/google/earthengine-catalog/blob/master/catalog/ESA/ESA_WorldCover_v200.jsonnet) e [definições compartilhadas](https://github.com/google/earthengine-catalog/blob/master/catalog/ESA/worldcover.libsonnet): distribuição de dados ESA pelo Google; informa 2021, 10 m, 11 classes e licença CC BY 4.0. Não substitui um relatório completo de acurácia.
5. [Catálogo Copernicus DEM GLO30](https://github.com/google/earthengine-catalog/blob/master/catalog/COPERNICUS/COPERNICUS_DEM_GLO30.jsonnet): descreve DSM, datum vertical e licença própria. Essa entrada está marcada como obsoleta no catálogo; selecionar a versão suportada antes da integração.
6. [Catálogo SRTMGL1_003](https://github.com/google/earthengine-catalog/blob/master/catalog/USGS/USGS_SRTMGL1_003.jsonnet): resolução aproximada de 30 m e extensão geográfica.
7. [README oficial Cesium for Unreal](https://github.com/CesiumGS/cesium-unreal/blob/main/README.md): globo WGS84, 3D Tiles, terreno/fotogrametria e serviços opcionais comerciais.
8. [Textos oficiais do site OSM](https://github.com/openstreetmap/openstreetmap-website/blob/master/config/locales/en.yml): seção `about` explica atribuição e obrigações condicionais de distribuição de dados derivados. Consultar também a [página de licença](https://www.openstreetmap.org/copyright) antes da distribuição.

Não foi possível consultar diretamente, devido a bloqueio HTTP 403 do proxy de rede: [ESA WorldCover](https://esa-worldcover.org/en/data-access), [Google Earth Studio](https://earth.google.com/studio/docs/advanced-features/3d-camera-export/), [diretrizes geográficas do Google](https://www.google.com/permissions/geoguidelines/) e [documentação Netlify Functions](https://docs.netlify.com/build/functions/overview/). Não se presume aprovação, proibição ou um limite atual a partir desse bloqueio. Não houve tentativa de contornar a política.

## Arquivo de demonstração existente

`test-results/preview.mp4` foi inspecionado com `ffprobe` e decodificado por completo com `ffmpeg` sem erros: H.264 High, YUV 4:2:0, 1280×720, 24 fps, duração de 8 segundos e 217.329 bytes. O erro de artefato mostrado na conversa não demonstra que esse MP4 esteja corrompido. O vídeo é apenas uma demonstração técnica, não comprova 4K, duração longa ou cenário real da viagem.

Para uma entrega utilizável fora do workspace, o aplicativo deve oferecer visualização e download por uma URL HTTP autorizada, com `Content-Type: video/mp4` e suporte a requisições parciais; links de caminho local dependem do serviço de artefatos do cliente. Corrigir a entrega no aplicativo não corrige automaticamente uma falha do visualizador de artefatos da conversa.
