# Slow View TV — separar trecho para avaliação

Esta ferramenta só separa uma amostra do MP4 original para avaliação interna.
Não melhora imagem ou áudio, não escurece, não publica, não acessa a internet e
não usa RunPod. Os ajustes vêm depois de analisar a filmagem e ouvir o som.

## Windows

1. Extraia o ZIP inteiro com **Extrair tudo**.
2. Abra `1-separar-trecho.cmd` e selecione o **MP4 original da viagem**.
   Também pode arrastar o MP4 sobre esse atalho.
3. Ao aparecer **PRONTO**, a pasta do resultado será aberta. Envie somente
   `trecho-original.mp4` na conversa. Não é necessário enviar o vídeo completo.

Não precisa instalar Node.js. Usa o PowerShell que acompanha o Windows 10/11
e os executáveis FFmpeg e FFprobe já extraídos. Reconhece o FFmpeg em
`D:\ffmpeg-9.0.2-essentials_build\bin` ou no PATH. Se não achar, solicita que
você selecione `ffmpeg.exe` na pasta `bin`; `ffprobe.exe` precisa estar ao lado.
Não exige administrador nem altera a política de execução do PowerShell.
Se o Windows bloquear o atalho, envie a mensagem; não desative as proteções.

O MP4 original só é lido. Cada execução cria uma pasta nova `Avaliacao-...`
ao lado dele, contendo o trecho e `informacoes.json` (dados técnicos locais).
É necessário ter permissão de gravação e espaço nessa pasta. No MP4 desta
viagem, reserve ao menos 100 MB para a amostra, não uma cópia de toda a viagem.

O trecho pedido começa aos dez minutos e dura aproximadamente 45 segundos.
Em vídeos menores ele é retirado do meio. Como não há recodificação, o corte
depende dos quadros-chave e pode começar antes ou durar um pouco mais.
Imagem, cadência e áudio são copiados sem filtros; sem áudio na fonte, o
trecho também será silencioso. A capa incorporada não é tratada como filmagem.

Se aparecer **ERRO**, não envie um MP4 incompleto: envie uma captura da janela.
Pode fechar a janela para interromper; o original permanece intacto. Nenhum
arquivo é enviado automaticamente. Uma amostra não representa a viagem inteira.
Fonte, créditos e licença devem ser conferidos antes de qualquer publicação.

## Desenvolvimento e testes

Gere o pacote com Node 24 (somente na máquina de desenvolvimento):

```sh
node scripts/package-local-review.mjs
# Compacte o conteúdo de artifacts/avaliacao-local em ZIP.
```

O atalho contém uma cópia literal do script, sem os parâmetros iniciais. O
gerador bloqueia caracteres que quebrariam a linha do CMD e limita seu tamanho.
Não usa script codificado, Invoke-Expression ou ExecutionPolicy Bypass.

```sh
# Requer PowerShell (pwsh), FFmpeg e FFprobe na máquina de testes:
node --test test/local-review.test.mjs
```

O corpo PowerShell e o corpo literal do atalho são testados no Linux com
FFmpeg e vídeos técnicos gerados para o teste. Isso não valida o CMD, a janela
de seleção, as políticas do Windows, nem o áudio/imagem da Flåmsbanen real.
A primeira execução no Windows ainda precisa ser conferida.
