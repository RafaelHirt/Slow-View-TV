# Mapa-base local

`countries-110m.geojson` contém os países do conjunto Natural Earth 1:110m, distribuído pelo pacote `world-atlas` e convertido de TopoJSON para GeoJSON com `topojson-client`. Natural Earth disponibiliza seus dados em domínio público: https://www.naturalearthdata.com/about/terms-of-use/ .

É um mapa-base simplificado para navegação mundial. Não contém trilhos, roteamento ou indicação de que uma viagem foi verificada. A camada de infraestrutura online vem do OpenRailwayMap e exige seus próprios créditos; os percursos importados de OSM preservam fonte e atribuição ODbL.

Para reproduzir o arquivo, execute `npm run prepare:map`. O script divide polígonos no antimeridiano e recorta o limite da projeção Web Mercator, preservando os 177 países e evitando ligações artificiais atravessando o mapa. Essa preparação afeta somente o mapa-base, sem modificar os pontos das rotas ferroviárias.
