param(
    [string]$InputPath,
    [string]$FFmpegPath,
    [ValidateRange(0, 86400)][double]$Start = 600,
    [ValidateRange(1, 120)][double]$Duration = 45,
    [switch]$NoOpen
);
$ErrorActionPreference = 'Stop';
function Select-LocalFile([string]$Title, [string]$Filter) {
    Add-Type -AssemblyName System.Windows.Forms;
    $dialog = New-Object System.Windows.Forms.OpenFileDialog;
    $dialog.Title = $Title;
    $dialog.Filter = $Filter;
    try {
        if ($dialog.ShowDialog() -eq 'OK') { return $dialog.FileName; };
        return '';
    } finally { $dialog.Dispose(); };
};
function Read-Media([string]$File) {
    $json = & $probe -v error -show_streams -show_format -of json $File;
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel ler o video com FFprobe.'; };
    return ($json | ConvertFrom-Json);
};
try {
    if (-not $InputPath) { $InputPath = Select-LocalFile 'Selecione o MP4 original da viagem' 'Video MP4 (*.mp4)|*.mp4'; };
    if (-not $InputPath) { Write-Host 'Cancelado. Nenhum arquivo foi criado.'; exit 0; };
    $source = Get-Item -LiteralPath $InputPath;
    if ($source.PSIsContainer -or $source.Extension -ine '.mp4') { throw 'Selecione o video MP4, nao a pasta nem o torrent.'; };
    if (-not $FFmpegPath) {
        $known = 'D:\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe';
        $installed = Get-Command ffmpeg -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1;
        if (Test-Path -LiteralPath $known -PathType Leaf) { $FFmpegPath = $known; }
        elseif ($installed) { $FFmpegPath = $installed.Source; }
        else { $FFmpegPath = Select-LocalFile 'Selecione ffmpeg.exe na pasta bin do FFmpeg ja extraido' 'FFmpeg (ffmpeg.exe)|ffmpeg.exe'; };
    };
    if (-not $FFmpegPath) { Write-Host 'Cancelado. Nenhum arquivo foi criado.'; exit 0; };
    $ffmpeg = (Get-Item -LiteralPath $FFmpegPath).FullName;
    $probeName = 'ffprobe';
    if ([IO.Path]::GetExtension($ffmpeg) -eq '.exe') { $probeName = 'ffprobe.exe'; };
    $probe = Join-Path (Split-Path -LiteralPath $ffmpeg) $probeName;
    if (-not (Test-Path -LiteralPath $probe -PathType Leaf)) { throw 'FFprobe nao encontrado ao lado de FFmpeg. Selecione a pasta bin correta.'; };
    $info = Read-Media $source.FullName;
    $video = $info.streams | Where-Object { $_.codec_type -eq 'video' -and $_.disposition.attached_pic -ne 1 } | Select-Object -First 1;
    $length = 0.0;
    $validLength = [double]::TryParse([string]$info.format.duration, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$length);
    if (-not $video -or -not $validLength -or [double]::IsInfinity($length) -or [double]::IsNaN($length) -or $length -le 0) { throw 'O arquivo precisa conter uma filmagem com duracao valida.'; };
    if ($Start + $Duration -gt $length) { $Start = [math]::Max(0, ($length - $Duration) / 2); };
    $seconds = $Start.ToString('0.000', [Globalization.CultureInfo]::InvariantCulture);
    $span = $Duration.ToString('0.000', [Globalization.CultureInfo]::InvariantCulture);
    $folder = Join-Path $source.DirectoryName ('Avaliacao-' + [guid]::NewGuid().ToString('N'));
    New-Item -ItemType Directory -Path $folder | Out-Null;
    $clip = Join-Path $folder 'trecho-original.mp4';
    Write-Host 'Separando um trecho original. Sem filtros, sem recodificacao e sem alterar a viagem.';
    & $ffmpeg -hide_banner -loglevel error -nostdin -ss $seconds -i $source.FullName -t $span -map ('0:{0}' -f $video.index) -map '0:a:0?' -c copy -avoid_negative_ts make_zero -n $clip;
    if ($LASTEXITCODE -ne 0) { throw ('A extracao falhou. Nao envie o MP4 incompleto. Pasta: ' + $folder); };
    $result = Read-Media $clip;
    $outputVideo = $result.streams | Where-Object { $_.codec_type -eq 'video' } | Select-Object -First 1;
    if (-not $outputVideo -or [double]::Parse($result.format.duration, [Globalization.CultureInfo]::InvariantCulture) -le 0) { throw 'O trecho nao contem video valido. Nao envie esse MP4.'; };
    $report = [ordered]@{ original = $source.FullName; originalBytes = $source.Length; requestedStartSeconds = $Start; requestedDurationSeconds = $Duration; source = $info; clip = $result; note = 'Amostra interna sem filtros. Copia por quadros-chave: inicio e duracao sao aproximados. Fonte e licenca ainda precisam ser conferidas antes de publicar.'; };
    $report | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $folder 'informacoes.json') -Encoding UTF8;
    Write-Host ('PRONTO. Anexe somente este video na conversa: ' + $clip);
    Write-Host 'O original foi preservado. Nenhuma live ou publicacao foi iniciada.';
    if (-not $NoOpen) {
        try { Invoke-Item -LiteralPath $folder; }
        catch { Write-Host ('AVISO: O trecho esta pronto, mas a pasta nao abriu. Abra manualmente: ' + $folder); };
    };
    exit 0;
} catch {
    Write-Host ('ERRO: ' + $_.Exception.Message);
    exit 1;
};
