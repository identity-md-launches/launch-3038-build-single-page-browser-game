import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(import.meta.dirname, '..');
const html = await readFile(join(root, 'index.html'), 'utf8');
const match = /<script id="game-script">([\s\S]*?)<\/script>/.exec(html);
if (!match) throw new Error('Cannot find the inline game JavaScript.');
const scratch = join(root, 'test/scratch/typecheck');
await mkdir(scratch, { recursive: true });
const file = join(scratch, 'game.js');
await writeFile(file, match[1]);
const program = ts.createProgram([file], {
  allowJs: true, checkJs: true, noEmit: true, strict: true,
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  types: []
});
const diagnostics = ts.getPreEmitDiagnostics(program);
const lineOffset = html.slice(0, match.index).split('\n').length - 1;
for (const diagnostic of diagnostics) {
  const position = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
  const where = position ? `index.html:${position.line + lineOffset + 1}:${position.character + 1}: ` : '';
  console.error(where + ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}
if (diagnostics.length) process.exitCode = 1;
else console.log('Typecheck passed: the actual inline game JavaScript, strict TypeScript checkJs, no emit.');
