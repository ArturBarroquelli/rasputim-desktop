const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('a versão web mantém os módulos centrais do Rasputim', () => {
  const app = read('src/web/App.tsx');
  for (const label of ['PCP', 'ESTOQUE', 'FERRAMENTAS', 'USUÁRIOS', 'RELATÓRIOS']) {
    assert.match(app, new RegExp(label));
  }
  assert.match(app, /Novo projeto/);
  assert.match(app, /Pipeline de produção/);
});

test('o build web tem ponto de entrada independente do Electron', () => {
  const config = read('vite.web.config.ts');
  assert.match(config, /root:\s*["']src\/web["']/);
  assert.match(config, /web-dist/);
});
