# Aconchego, preferência e luz suave

Diretriz de produto discutida com o usuário em 19/10/2026. O objetivo é uma experiência confortável de contemplação, com controle sobre imagem, som e duração. Não há validação clínica do produto nem evidência apresentada aqui de que neve noturna seja a melhor cena para todas as pessoas.

## O que podemos aproveitar

Hygge é um conceito cultural dinamarquês associado a aconchego, familiaridade, presença e convivência. Serve como inspiração editorial; não é um diagnóstico nem um protocolo de tratamento. No vídeo, a sensação de abrigo pode vir do ponto de vista protegido, de luz suave e de um ambiente previsível. São hipóteses de design a comparar com a preferência de cada pessoa.

Neve pode simplificar a paisagem, e uma cena com movimento regular pode exigir menos acompanhamento de uma história. A noite pode reduzir estímulos visíveis. Essas características dependem da filmagem: neve sob sol pode ter muito brilho; faróis, postes, túneis, granulação e buzinas podem produzir mudanças intensas. Cena escura também pode ser desagradável para algumas pessoas. Tela muito brilhante continua brilhante mesmo quando representa uma noite.

O conforto depende da combinação de imagem, som e controle. Priorizar reprodução iniciada pelo usuário, volume inicial baixo, ausência de outro vídeo automático, temporizador opcional, avisos discretos de som intenso e legendas/mapa que possam ser ocultados. Parte desses controles já está no player; a triagem de eventos sonoros ainda não está implementada.

## Estado da evidência e da pesquisa

As buscas externas desta etapa em Google, PubMed, Crossref e blog oficial YouTube receberam **CONNECT 403 do proxy deste ambiente**. Acesso completo escolhido pelo usuário na interface não alterou a lista de destinos desta instância. Não foram usados outros caminhos para contornar essa restrição.

Destinos necessários para retomar a pesquisa nas configurações de rede do ambiente: `www.google.com`, `pubmed.ncbi.nlm.nih.gov`, `api.crossref.org`, `doi.org`, `blog.youtube`, `www.youtube.com` e `www.traveldojo.com`. O espelho de vídeo requer `blog.nytsoi.net` e `trainfulness.nytsoi.net`. A lista de rede já salva em rascunho não está disponível para leitura; ela não foi substituída por uma lista presumida.

| Afirmação | Como tratar agora |
| --- | --- |
| Exposição a cenas naturais pode favorecer recuperação de estresse/atenção | Compatível com literatura clássica de psicologia ambiental; não demonstra efeito específico de neve à noite, nem eficácia do nosso player |
| Contraste frio exterior/abrigo e movimento previsível explicam a preferência do usuário | Hipóteses plausíveis; ainda não foram medidas neste produto |
| Revisão de 2023 com 59 estudos e estudo de 2019 sobre vídeo percebido como ao vivo | O texto recebido não identifica títulos/DOIs; não conferidos nesta etapa |
| Soothing Relaxation com 4,8 bilhões e caminhadas com 17,6/13,3/7,3 milhões de views | Valores fornecidos pelo usuário, não verificados aqui; não usar como audiência medida ou projeção de receita |
| Tornar a cena mais escura melhora sono/ansiedade | Não estabelecido para o produto; precisa ser uma preferência reversível, sem promessa de resultado médico |

Referências clássicas para orientar a próxima consulta, **não abertas nesta etapa**:

- Ulrich et al. (1991), *Stress recovery during exposure to natural and urban environments*: https://doi.org/10.1016/S0272-4944(05)80184-7
- Kaplan (1995), *The restorative benefits of nature: Toward an integrative framework*: https://doi.org/10.1016/0272-4944(95)90001-2

Para confirmar audiência, registrar link do vídeo, canal, data de publicação, duração, data/hora da contagem e tipo de imagem/som. Views acumuladas não são pessoas únicas, receita, preferência causal ou eficácia terapêutica. Comparar vídeos do mesmo canal e duração semelhante reduz algumas diferenças, mas ainda não isola neve e noite. Esta etapa não contém um levantamento novo de mercado.

## Decisão para a experiência

1. Manter o arquivo original e seus dados de gravação. Priorizar a busca por neve e noite reais como duas categorias importantes do catálogo.
2. Oferecer uma opção de **Luz suave**: preservar texturas da neve e detalhes nas sombras, reduzir realces agressivos e ajustar cores com moderação. Aplicar por cena, depois de comparar o original.
3. Experimentar **Escurecimento gradual** como opção separada. Usar transição contínua, de vários minutos numa sessão longa, com limite de escurecimento e possibilidade de voltar ao original. A amostra curta acelera essa transição apenas para avaliação visual.
4. Identificar o tratamento como simulado. Não atribuir “17h” à imagem: aparência do fim de tarde depende de latitude, estação, nuvens e posição do sol. Horário atual de Oslo e horário da gravação são dados distintos.
5. Equalizar/limitar sons agressivos após ouvir e medir o material. Não adicionar som como se tivesse sido captado naquele lugar. O clipe Pexels existente tem faixa praticamente silenciosa.

O tratamento simples de cor pode ser feito pelo **FFmpeg no RunPod existente**, acionado pelo painel Netlify, sem um modelo de IA. Escurecer não altera a direção das sombras, não cria iluminação noturna real e não restaura detalhes ausentes. Uma conversão noturna convincente pode exigir mais trabalho; não é requisito para testar conforto.

## Amostra e próximo teste

O estudo local em `artifacts/cozy-light-pilot/` compara o mesmo trecho Pexels original com luz progressivamente suavizada, em sincronia, por 20 segundos. Sem áudio acrescentado, mapa ou posição inventados. É uma amostra visual, **ainda não uma opção integrada ao editor**. Créditos e filtros estão no mesmo diretório.

Depois de obter a viagem NRK, escolher um trecho contínuo de 60–90 segundos com som audível conferido. Comparar Original, Luz suave e, separadamente, transição gradual numa sessão maior. Perguntar de forma opcional “mais confortável, igual ou menos confortável?” e se o volume e a luminosidade exigiram correção. Registrar também desconforto com movimento ou escuridão; tempo assistido sozinho não demonstra calma nem sono melhor. Só então decidir os valores padrão e a integração ao editor.
