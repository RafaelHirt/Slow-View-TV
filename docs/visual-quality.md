# Meta visual e validação antes de renderizações pagas

Registro histórico do protótipo 3D. O produto passou a trabalhar com filmagens reais; o fluxo atual está em [filmagens reais](real-footage.md). O estudo Blender abaixo não é o próximo trabalho do piloto atual.

## Referência recebida

O usuário indicou `https://www.youtube.com/watch?v=tAWFO8_O_7M` como referência de realismo. O acesso ao YouTube foi bloqueado pela rede do ambiente Codex; o vídeo ainda não foi assistido aqui. Não inferir seu título, local, enquadramento ou conteúdo sonoro sem obter uma referência visual acessível.

O usuário rejeitou expressamente a aparência da demonstração **Vale sereno**. A maquete de cones e terreno de cores sólidas não satisfaz o objetivo de viagens visualmente realistas.

## O que o piloto confirmou

- Painel Netlify conectado à API autenticada no RunPod; saúde pública com `ok: true` e `authRequired: true` observada pelo usuário.
- Chromium usando a RTX 4090 pelo ANGLE/Vulkan: `nvidiaRenderer: true` e `softwareRenderer: false` observados no Pod.
- Primeiro MP4 demonstrativo de oito segundos, 720p, concluído e reproduzido no painel pelo usuário.
- Isso valida a cadeia técnica do protótipo, não a qualidade visual, a reconstrução de Viena–Praga ou a produção de horas. O encoder continua libx264 na CPU; áudio permanece ausente.

## Lacuna atual

`JourneyScene.tsx` gera terreno por funções trigonométricas, árvores de baixa complexidade, materiais sem texturas e iluminação simples. Não há coleção de modelos realistas, materiais PBR, imagens de ambiente, terreno geográfico ou referências locais integradas. Aumentar a resolução preserva essa aparência. GPX e DEM isoladamente não fornecem uma cena fotográfica.

## Próxima validação

1. Examinar imagens e movimento da referência do usuário antes de fixar o padrão visual. Solicitar quadros representativos ou um recorte quando o vídeo não estiver acessível.
2. Produzir primeiro uma imagem de estudo em altura de cabine, com ferrovia em escala, lastro e materiais detalhados, vegetação, iluminação e horizonte coerentes. Identificar explicitamente um corredor genérico; não chamá-lo de Viena–Praga sem dados verificados.
3. Comparar essa imagem com a referência. Não declarar fotorrealismo com base em um render tecnicamente bem-sucedido.
4. Após o usuário considerar a direção visual adequada, gerar um trecho contínuo de 10–20 segundos e avaliar continuidade, aparecimento de objetos, materiais, movimento e som. Um único quadro não valida animação.
5. Só então medir custo e prazo no servidor pago e ampliar a duração. Manter geometria real, referências locais e direitos de uso por trecho.

Blender 4.3.2 foi encontrado neste ambiente e sua inicialização sem interface e Cycles CPU foram verificados. Um estudo isolado em `artifacts/visual-study/` não altera o painel nem demonstra integração de um worker Blender. Não usar imagem gerada por IA como prova de renderização do sistema.

O primeiro estudo foi concluído em `artifacts/visual-study/forest-rail-study.png`: 1280×720, Cycles CPU, 32 amostras, seis threads, 188,767 s de renderização. A receita Python, o `.blend`, as medições e a avaliação estão no mesmo diretório. O Blender local não tem OpenImageDenoise; a imagem final foi gerada sem denoising nem pós-processamento. A avaliação encontrou melhoria na geometria e na iluminação, mas vegetação repetitiva/esparsa, lastro claro, piso pouco detalhado e ruído. **O estudo não atingiu fotorrealismo e não está aprovado para produção.** Não substituir o renderizador publicado por esse estudo nem iniciar animações pagas com base nele.

Há HDRIs locais em `/usr/share/blender/datafiles/studiolights/world/`; o `license.txt` declara CC0, autoria Greg Zaal/Poly Haven. Não foram usados neste primeiro estudo. Modelos e materiais detalhados, referências geográficas e análise da referência visual continuam necessários.

Para conter custos enquanto o conteúdo visual é revisto, o usuário foi orientado a parar o Pod. Isso interrompe a API; o Network volume permanece e continua sujeito à cobrança. Ainda não há confirmação de que o usuário o parou.
