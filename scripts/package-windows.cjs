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
    "start \"\" \"Rasputim Tecnologis.exe\" --web-server",
    "echo O navegador sera aberto neste computador.",
    "echo Nos outros computadores, use o endereco mostrado na tela inicial do Rasputim.",
    "popd",
  ].join("\r\n"), "utf8");

  console.log(`Build concluído: ${paths.join(', ')}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
