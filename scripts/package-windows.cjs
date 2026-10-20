const fs = require('node:fs');
const path = require('node:path');

async function main() {
  let packager;
  try {
    ({ packager } = require('@electron/packager'));
  } catch {
    throw new Error('Instale @electron/packager e electron@28.3.3 antes de executar o build. No GitHub Actions isso é feito automaticamente.');
  }

  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'dist');
  fs.rmSync(out, { recursive: true, force: true });

  const paths = await packager({
    dir: root,
    name: 'Rasputim Tecnologis',
    platform: 'win32',
    arch: 'x64',
    electronVersion: '28.3.3',
    out,
    overwrite: true,
    asar: true,
    prune: true,

    ignore: [
      /^\/\.git($|\/)/,
      /^\/\.github($|\/)/,
      /^\/docs($|\/)/,
      /^\/test($|\/)/,
      /^\/dist($|\/)/,
      /^\/models\/.*\.(gguf|bin)$/i,
      /^\/vendor\/llama\/.*\.(exe|dll|so|dylib|gguf)$/i,
    ],
  });

  const packageDirectory = paths[0];
  const launcherPath = path.join(packageDirectory, "INICIAR-RASPUTIM-WEB-CENTRAL.cmd");
  fs.writeFileSync(launcherPath, [
    "@echo off",
    "title Rasputim Central Web",
    "pushd \"%~dp0\"",
    "echo Iniciando o Rasputim na rede local...",
    "\"Rasputim Tecnologis.exe\" --web-server",
    "echo Servidor encerrado.",
    "popd",
  ].join("\r\n"), "utf8");
  fs.writeFileSync(path.join(packageDirectory, "COMO-ACESSAR-PELA-REDE.txt"), [
    "RASPUTIM CENTRAL WEB — ACESSO LOCAL",
    "",
    "1. No notebook central, deixe esta pasta extraída e execute INICIAR-RASPUTIM-WEB-CENTRAL.cmd.",
    "2. O navegador do notebook abrirá automaticamente em http://localhost:8080.",
    "3. No primeiro acesso, crie o responsável geral e a senha inicial.",
    "4. Para descobrir o endereço dos outros computadores: pressione Win+R, digite cmd e execute ipconfig.",
    "5. Localize 'Endereço IPv4' da rede Wi-Fi. Exemplo: 192.168.1.50.",
    "6. Nos computadores da fábrica, abra http://SEU-IP:8080. Exemplo: http://192.168.1.50:8080.",
    "",
    "Deixe a janela do Rasputim aberta no notebook central enquanto os demais computadores estiverem usando o sistema.",
    "O sistema funciona somente na rede local e não depende de internet.",
  ].join("\r\n"), "utf8");

  console.log(`Build concluído: ${paths.join(', ')}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
