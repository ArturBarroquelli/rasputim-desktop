name: Compilar Rasputim para Windows

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build:
    runs-on: windows-2022
    timeout-minutes: 25
    steps:
      - name: Obter fontes
        uses: actions/checkout@v4

      - name: Preparar Node.js oficial
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: app-source/package-lock.json

      - name: Extrair aplicativo
        shell: pwsh
        run: |
          Expand-Archive -Path app-source.zip -DestinationPath app-source -Force
          New-Item -ItemType Directory -Force -Path build\app | Out-Null
          Copy-Item app-source\* build\app -Recurse -Force

      - name: Instalar dependências fixadas
        shell: pwsh
        working-directory: build/app
        run: npm ci --include=optional

      - name: Verificar JavaScript
        shell: pwsh
        working-directory: build/app
        run: npm run check

      - name: Compilar janela WebView2
        shell: pwsh
        run: |
          dotnet restore desktop\Rasputim.Desktop.csproj
          dotnet build desktop\Rasputim.Desktop.csproj -c Release -o build\launcher

      - name: Montar aplicativo portátil
        shell: pwsh
        run: |
          Copy-Item build\launcher\* build\app -Recurse -Force
          Copy-Item (Get-Command node.exe).Source build\app\node.exe -Force
          Copy-Item desktop\Rasputim.ico build\app\Rasputim.ico -Force
          Get-ChildItem build\app -Recurse -Include *.bat,*.cmd,*.ps1,*.vbs | Remove-Item -Force
          if (Test-Path build\app\.env) { Remove-Item build\app\.env -Force }
          Compress-Archive -Path build\app\* -DestinationPath Rasputim-v5.4-Desktop-Windows.zip -CompressionLevel Optimal
          (Get-FileHash Rasputim-v5.4-Desktop-Windows.zip -Algorithm SHA256).Hash | Out-File Rasputim-v5.4-Desktop-Windows.zip.sha256 -Encoding ascii

      - name: Publicar pacote
        uses: actions/upload-artifact@v4
        with:
          name: Rasputim-v5.4-Desktop-Windows
          path: |
            Rasputim-v5.4-Desktop-Windows.zip
            Rasputim-v5.4-Desktop-Windows.zip.sha256
          if-no-files-found: error
          retention-days: 7
