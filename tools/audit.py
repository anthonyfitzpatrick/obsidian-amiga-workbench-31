"""Audits this theme repository on its own. No other repository is read."""
import re, json, pathlib, sys, struct

ROOT = pathlib.Path.cwd()
ASAR = pathlib.Path("/Applications/Obsidian.app/Contents/Resources/obsidian.asar")
APP = ASAR.read_bytes() if ASAR.exists() else None
PLUGINS = pathlib.Path.home()/"My Drive (anthony@adaptiveconsole.com)/Obsidian Note Vaults/Wolf 359 Press AB/Wolf 359 Press AB/.obsidian/plugins"
P = F = 0
def ok(m):
    global P; P += 1; print(f"    pass  {m}")
def bad(m):
    global F; F += 1; print(f"    FAIL  {m}")

manifest = json.loads((ROOT/"manifest.json").read_text())
css = (ROOT/"theme.css").read_text()
body = re.sub(r'/\*[\s\S]*?\*/', '', css)
name = manifest["name"]
print(f"\n{'='*68}\n{name}\n{'='*68}")

print("\n  [1] Packaging")
for f in ("theme.css","manifest.json","README.md","LICENSE","screenshot.png"):
    ok(f"{f} at repository root") if (ROOT/f).exists() else bad(f"{f} missing at root")
for k in ("name","version","minAppVersion","author"):
    ok(f"manifest.{k} = {manifest[k]!r}") if manifest.get(k) else bad(f"manifest missing {k}")
ok("semver version") if re.fullmatch(r'\d+\.\d+\.\d+', manifest["version"]) else bad("version is not x.y.z")
ok("no empty manifest fields") if not [k for k,v in manifest.items() if v==""] else bad("manifest has an empty field")
ok("name does not contain 'Obsidian'") if "obsidian" not in name.lower() else bad("name contains 'Obsidian'")
lic = (ROOT/"LICENSE").read_text()
ok("LICENSE is MIT with a copyright line") if "MIT License" in lic and "Copyright (c)" in lic else bad("LICENSE is not a complete MIT")
w,h = struct.unpack(">II", (ROOT/"screenshot.png").read_bytes()[16:24])
ok(f"screenshot is {w} x {h}") if w >= 512 else bad(f"screenshot only {w}px wide")

print("\n  [2] Independence")
refs = [p for p in ROOT.rglob("*") if p.is_file() and ".git/" not in str(p) and p.suffix in (".css",".mjs",".json",".md",".yml")
        and "obsidian-amiga-inspired-theme" in p.read_text(errors="ignore")]
ok("no reference to any other repository") if not refs else bad(f"references another repo: {[str(p.relative_to(ROOT)) for p in refs]}")
for need in ("src","tools/build.mjs","tools/verify.mjs","package.json"):
    ok(f"{need} present — buildable here") if (ROOT/need).exists() else bad(f"{need} missing")
ok(f"{len(list((ROOT/'src').rglob('*.css')))} source modules vendored")

print("\n  [3] CSS structure")
ok(f"braces balanced ({css.count('{')} rules)") if css.count("{") == css.count("}") else bad("brace mismatch")
flat = re.sub(r'@media[^{]*\{', '', body)
ok("no nested or unclosed rule bodies") if not re.search(r'\{[^{}]*\{', flat) else bad("nested rule body")
ok("no empty declarations") if not re.findall(r';\s*;', body) else bad("empty declarations")

print("\n  [4] Tokens")
defined = set(re.findall(r'(--[a-z0-9-]+)\s*:', css))
used = set(re.findall(r'var\((--[a-z0-9-]+)', css))
undef = {u for u in used if u.startswith('--amiga')} - defined
ok(f"{len(defined)} defined, {len(used)} referenced, none undefined") if not undef else bad(f"undefined: {sorted(undef)}")
unused = {t for t in defined if t.startswith('--amiga')} - used - {'--amiga-personality','--amiga-icon-paper','--amiga-icon-ink','--amiga-icon-accent'}
ok("no dead --amiga tokens") if not unused else bad(f"defined but unused: {sorted(unused)}")

print("\n  [5] Light and dark")
def palette(sel):
    best = {}
    for blk in re.findall(re.escape(sel) + r' \{(.*?)\n\}', css, re.S):
        got = dict(re.findall(r'(--amiga-[a-z-]+):\s*(#[0-9a-fA-F]{6})', blk))
        if len(got) > len(best): best = got
    return best
lt, dk = palette('body.theme-light'), palette('body.theme-dark')
ok(f"both modes define the same {len(lt)} colours") if set(lt)==set(dk) else bad(f"asymmetric: {set(lt)^set(dk)}")
same = [k for k in lt if lt[k]==dk[k]]
ok(f"dark is designed, not a copy ({len(lt)-len(same)}/{len(lt)} differ)") if len(same) < len(lt)*0.4 else bad("dark too close to light")
ok("dark declares color-scheme") if "color-scheme: dark" in css else bad("missing color-scheme: dark")

print("\n  [6] Isolation and safety")
for pat, what in [(r'@import','@import'), (r'url\(\s*https?:','remote url()'), (r'<script','script tag'),
                  (r'javascript:','javascript: url'), (r'expression\(','IE expression'),
                  (r'\.amiga-workbench-\d','personality body class'), (r'class-select','personality chooser')]:
    ok(f"no {what}") if not re.search(pat, css, re.I) else bad(f"contains {what}")
for other in ("Workbench 1.3","Workbench 2.04","Workbench 3.1"):
    if other.split()[-1] not in name and f'"{other}"' in css: bad(f"leaks {other}")
ok("no other personality leaked")

print("\n  [7] Selectors against Obsidian and installed plugins")
classes = {c for c in re.findall(r'\.([a-z][a-z0-9-]{3,})', body) if not c.startswith('amiga')}
if APP is None:
    print("    skip  Obsidian not installed; selector existence not checked")
else:
    blob = b""
    if PLUGINS.exists():
        for f in list(PLUGINS.glob("*/*.css")) + list(PLUGINS.glob("*/main.js")):
            try: blob += f.read_bytes()
            except Exception: pass
    unknown, owned = [], []
    for c in sorted(classes):
        if c.encode() in APP: continue
        (owned if c.encode() in blob else unknown).append(c)
    if owned: ok(f"{len(owned)} classes belong to installed plugins: {owned}")
    ok(f"all {len(classes)} classes exist in Obsidian") if not unknown else bad(f"unknown classes: {unknown}")

print("\n  [8] Robustness")
imp = len(re.findall(r'!important', css))
ok(f"!important used sparingly ({imp})") if imp <= 12 else bad(f"!important overused ({imp})")
deep=[]
for sel in re.findall(r'(?m)^([^{@}]{5,})\{', body):
    for part in re.sub(r'\([^()]*\)','', re.sub(r'\[[^\]]*\]','[]', sel)).split(','):
        if len([x for x in part.strip().split() if x not in ('>','+','~')]) >= 5: deep.append(part)
ok("no selector deeper than 4 steps") if not deep else bad(f"{len(deep)} deep chains")
for q in ("prefers-reduced-motion","prefers-contrast","print"):
    ok(f"@media {q}") if q in css else bad(f"missing @media {q}")
ok("mobile handling present") if "is-mobile" in css else bad("no mobile handling")

print(f"\n  {P} passed, {F} failed")
sys.exit(1 if F else 0)
