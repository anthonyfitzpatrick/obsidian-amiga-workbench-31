import { access, readFile } from 'node:fs/promises';

/* Checks this theme on its own. Nothing here reads another repository. */
const NAME = 'Modern Amiga Workbench 3.1 inspired';
const SLUG = 'workbench31';

for (const f of ['manifest.json', 'theme.css', 'README.md', 'LICENSE']) await access(f);
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
for (const key of ['name', 'version', 'minAppVersion', 'author']) {
  if (!manifest[key]) throw new Error(`manifest.json is missing ${key}`);
}
if (manifest.name !== NAME) throw new Error(`manifest name is ${manifest.name}, expected ${NAME}`);
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error(`version ${manifest.version} is not x.y.z`);
if (Object.values(manifest).some((v) => v === '')) throw new Error('manifest has an empty field; omit it instead');

const css = await readFile('theme.css', 'utf8');
if (css.match(/\{/g).length !== css.match(/\}/g).length) throw new Error('unbalanced braces in theme.css');
for (const [pattern, what] of [[/@import/, '@import'], [/url\(\s*https?:/, 'a remote url()'],
     [/<script/i, 'a script tag'], [/javascript:/i, 'a javascript: url'], [/class-select/, 'a personality chooser']]) {
  if (pattern.test(css)) throw new Error(`theme.css contains ${what}`);
}
for (const required of ['body.theme-light', 'body.theme-dark', '--amiga-personality', '@media print',
                        'prefers-reduced-motion', 'prefers-contrast']) {
  if (!css.includes(required)) throw new Error(`theme.css lacks ${required}`);
}
const defined = new Set([...css.matchAll(/(--amiga-[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
for (const m of css.matchAll(/var\((--amiga-[a-z0-9-]+)/gi)) {
  if (!defined.has(m[1])) throw new Error(`theme.css uses undefined token ${m[1]}`);
}
/* Obsidian declares its own tokens on .theme-light/.theme-dark, so the mapping block must
   carry a theme class to outrank them, and must sit on body to see the palette. */
const variables = await readFile('src/core/variables.css', 'utf8');
if (!/^body\.theme-light,\s*\nbody\.theme-dark \{/m.test(variables)) {
  throw new Error('the Obsidian mapping block must be scoped to body.theme-light, body.theme-dark');
}

const relativeLuminance = (hex) => {
  const p = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
};
const contrast = (a, b) => { const [x, y] = [relativeLuminance(a), relativeLuminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

for (const file of [`src/variants/${SLUG}.css`, `src/variants/${SLUG}-dark.css`]) {
  const source = await readFile(file, 'utf8');
  if ((source.match(/\{/g) ?? []).length !== 1) throw new Error(`${file} must be a single declaration block`);
  for (const property of ['background', 'border', 'padding', 'margin', 'display', 'font-family']) {
    if (new RegExp(`^\\s*${property}\\s*:`, 'm').test(source)) throw new Error(`${file} must not restate structure (${property})`);
  }
  const palette = Object.fromEntries([...source.matchAll(/(--amiga-[a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
  for (const [ink, ground, floor] of [['--amiga-text', '--amiga-window', 4.5], ['--amiga-text-muted', '--amiga-window', 4.5],
       ['--amiga-text', '--amiga-panel', 4.5], ['--amiga-text-accent', '--amiga-window', 4.5],
       ['--amiga-text-title', '--amiga-titlebar', 4.5], ['--amiga-text-title', '--amiga-titlebar-inactive', 4.5],
       ['--amiga-text-on-selection', '--amiga-selection', 4.5], ['--amiga-text-on-accent', '--amiga-accent', 4.5],
       ['--amiga-focus', '--amiga-window', 3]]) {
    const ratio = contrast(palette[ink], palette[ground]);
    if (ratio < floor) throw new Error(`${ink} gives only ${ratio.toFixed(2)}:1 against ${ground} in ${file}`);
  }
}
console.log(`Verification passed for ${NAME}.`);
