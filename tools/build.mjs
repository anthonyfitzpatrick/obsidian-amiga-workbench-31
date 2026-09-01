import { readFile, writeFile } from 'node:fs/promises';

/* Builds this theme's theme.css from the modules in src/. Self-contained: nothing here
   reads from, or depends on, any other repository. */

const NAME = 'Modern Amiga Workbench 3.1 inspired';
const PERSONALITY = 'Workbench 3.1';
const LIGHT = 'src/variants/workbench31.css';
const DARK  = 'src/variants/workbench31-dark.css';
const SOURCE_LIGHT = '.amiga-workbench-31';
const SOURCE_DARK  = '.theme-dark.amiga-workbench-31';

const shared = [
  'src/core/variables.css', 'src/core/accessibility.css', 'src/core/surfaces.css',
  'src/components/workspace.css', 'src/components/editor.css', 'src/components/controls.css',
  'src/components/overlays.css', 'src/components/content.css', 'src/components/advanced.css'
];
const chromeModule = 'src/components/workbench-chrome.css';
const settingsModule = 'src/core/settings.css';
const pictogramModule = 'src/icons/workbench-pictograms.css';
const chromeMarker = '.amiga-workbench';
const banner = '/* Generated distribution artifact. Do not edit directly. */\n';

const stripSettings = (css) => css.replace(/\/\* @settings[\s\S]*?\*\//, '');
const replaceSelector = (css, selector, replacement) => {
  if (!css.includes(selector)) throw new Error(`Expected selector was not found: ${selector}`);
  return css.replaceAll(selector, replacement);
};
const setPersonality = (css, personality) => css.replace(/--amiga-personality\s*:\s*"[^"]+"\s*;/, `--amiga-personality: "${personality}";`);

/* Pictograms are drawn once and coloured from this personality's icon tokens, so a
   palette change cannot leave a stale inline SVG fill behind. */
const iconTokens = { __PAPER__: '--amiga-icon-paper', __INK__: '--amiga-icon-ink', __ACCENT__: '--amiga-icon-accent' };
const readToken = (css, token, source) => {
  const value = css.match(new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`))?.[1];
  if (!value) throw new Error(`${source} does not define an icon colour for ${token}`);
  return value;
};
const renderPictograms = (template, selector, paletteCss, source) => {
  let css = replaceSelector(template, chromeMarker, selector);
  for (const [placeholder, token] of Object.entries(iconTokens)) {
    css = css.replaceAll(placeholder, `%23${readToken(paletteCss, token, source).replace('#', '')}`);
  }
  if (css.includes('__')) throw new Error(`Unsubstituted pictogram placeholder for ${selector}`);
  return css;
};

const read = (files) => Promise.all(files.map((f) => readFile(f, 'utf8')));
const [modules, light, dark, chrome, pictograms, settings] = await Promise.all([
  read(shared), readFile(LIGHT, 'utf8'), readFile(DARK, 'utf8'),
  readFile(chromeModule, 'utf8'), readFile(pictogramModule, 'utf8'), readFile(settingsModule, 'utf8')
]);

const parts = [
  ...modules,
  replaceSelector(chrome, chromeMarker, 'body'),
  setPersonality(replaceSelector(stripSettings(light), SOURCE_LIGHT, 'body.theme-light'), PERSONALITY),
  setPersonality(replaceSelector(dark, SOURCE_DARK, 'body.theme-dark'), PERSONALITY),
  renderPictograms(pictograms, 'body.theme-light', light, LIGHT),
  renderPictograms(pictograms, 'body.theme-dark', dark, DARK),
  settings
];
const css = `${banner}\n${parts.filter(Boolean).join('\n\n')}`;
if (/class-select|\.amiga-workbench-|body\.theme-(?:light|dark):not\(/.test(css)) {
  throw new Error('Built CSS still carries a multi-personality dependency');
}
await writeFile('theme.css', css);
console.log(`Built theme.css for ${NAME} from ${parts.length} modules.`);
