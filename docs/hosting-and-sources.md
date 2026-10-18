# Fontes e infraestrutura escolhidas para o piloto

Este documento descreve decisões de projeto e requisitos iniciais de teste. Não declara que todos os provedores estejam integrados ou que a produção fotorealista de horas esteja validada.

## Fontes

| Informação | Fonte escolhida | Estado atual |
| --- | --- | --- |
| Trilhos, estações, pontes e túneis mapeados | OpenStreetMap, consultado por Overpass | Integração de relações ferroviárias implementada e testada com fixtures. Após a alteração de rede, a consulta real do aplicativo em uma área pequena de Viena excedeu 30 segundos. Nenhum traçado real foi importado. |
| Referência visual da rede | OpenRailwayMap | Camada configurada; uma imagem de mapa retornou HTTP 200 após a liberação de rede em 18/10/2026. Não substitui extração ou roteamento. |
| Paradas, duração e calendário do serviço | Dados oficiais das operadoras; GTFS quando disponível e autorizado | Verificar os feeds utilizáveis de ÖBB e České dráhy para Viena–Praga. Ainda não integrado. |
| Relevo | Copernicus DEM, com tratamento de pontes/túneis e altura efetiva do trilho | Ainda não integrado. Selecionar versão suportada e verificar datum vertical. |
| Categorias de vegetação e uso do solo | ESA WorldCover, complementado por referências visuais licenciadas de cada trecho | Ainda não integrado. Classes amplas de 10 m não determinam espécies ou árvores individuais. |
| Aparência de estações, fachadas e elementos locais | OSM onde houver dados e fotografias/vídeos próprios ou licenciados | Aquisição e construção do cenário pendentes. |
| Áudio | Gravações próprias ou licenciadas de trens, trilhos e condições do tempo | Ainda sem áudio no protótipo. |

O mapa mundial simplificado já usa Natural Earth em domínio público. A paisagem 3D atual é procedural e ilustrativa, sem correspondência visual comprovada com Viena–Praga. Google Earth Studio não é uma dependência escolhida. Créditos, datas e licenças devem acompanhar os dados usados.

## Hospedagem

| Parte | Configuração inicial proposta |
| --- | --- |
| Painel | Hospedagem estática no Netlify |
| API e catálogo, sem renderização | VPS Linux com 2 vCPU, 4 GB RAM e 40–80 GB SSD persistente; DigitalOcean é uma opção |
| Primeiro teste com GPU | 8 vCPU, 32 GB RAM, NVIDIA com 16 GB VRAM e pelo menos 100 GB SSD; aumentar disco para viagens longas |
| Preferência para cenário detalhado | GPU com 24 GB VRAM, 32–64 GB RAM e cerca de 200 GB NVMe |
| Vídeos finais | Evoluir para armazenamento de objetos compatível com S3, como Spaces, com dimensionamento de capacidade e transferência |

São configurações iniciais de benchmark, não mínimos universais ou garantia de renderização em tempo real. Para duas horas a 35–60 Mb/s, somente o vídeo final ocupa cerca de 31,5–54 GB decimais. Caches e espaço temporário são adicionais.

No código atual, API, SQLite, fila e renderizador ainda executam no mesmo servidor. O primeiro benchmark pode mover a aplicação inteira para uma máquina GPU temporária. Separar a fila e o worker remoto será uma adaptação posterior. Desligar uma instância GPU exige preservar banco e arquivos num volume persistente; interrompe trabalhos ativos.

`CHROMIUM_GPU_MODE=native` permite usar o driver instalado, mas não fornece GPU, não comprova aceleração e não muda o encoder libx264, que atualmente usa CPU. Validar gráficos Linux/EGL/Vulkan, captura e codificação. O cenário fotorealista futuro pode exigir outro motor, como Unreal/Cesium, e outro perfil de máquina.

Não contratar GPU continuamente antes do benchmark. Nenhum preço de fornecedor ou disponibilidade por região foi confirmado nesta etapa. A demonstração visual para revisão dispensa VPS e GPU.

Para o piloto, a recomendação é um Pod RunPod sob demanda com RTX 4090 de 24 GB, aproximadamente 8 vCPU, 32 GB RAM e 100–200 GB de disco. A [documentação oficial de escolha de GPU](https://github.com/runpod/docs/blob/d267bc5c7b0e6ee99fe0adcc2ddd8052c44f9375/pods/choose-a-pod.mdx) recomenda RT cores e 16–24 GB de memória para 3D. Isso é uma referência para medição, não uma garantia de desempenho no renderizador atual.

DigitalOcean também oferece GPU Droplets: a [OpenAPI oficial](https://github.com/digitalocean/openapi/blob/840dc604b18ea5ba4607d573a46343b4009116e8/specification/resources/droplets/droplets_list.yml) distingue máquinas CPU e GPU. Criar um projeto no console não seleciona nem contrata uma dessas máquinas. Não foi feita contratação ou publicação nesta etapa.

## Acesso e memória do projeto

O painel exige autenticação antes de carregar as coleções. O cadastro de senha por HTTP fica desativado por padrão; configurar `DASHBOARD_PASSWORD` no ambiente seguro do servidor. Senhas são persistidas como hash scrypt e as sessões expiram em 12 horas. Não incluir a senha nas variáveis `VITE_*` nem nas notas.

A aba **Fontes e plano** mantém uma biblioteca de referências e notas editáveis em SQLite. As notas sobrevivem ao reinício do servidor se o diretório de dados for preservado. A biblioteca diferencia integrações implementadas, fontes pendentes e referências opcionais.
