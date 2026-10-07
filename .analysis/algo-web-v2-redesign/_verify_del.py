import hashlib, os
R = 'D:/TechGar2/algo-web-v2'
B = 'D:/TechGar2/.analysis/algo-web-v2-redesign/backup-old-v2'
txt = open('D:/TechGar2/.analysis/algo-web-v2-redesign/DELETE-LIST.txt', encoding='utf8').read().splitlines()
files = []
sec = None
for l in txt:
    if l.startswith('=== '):
        sec = l
        continue
    if sec and l.strip():
        files.append((sec[:6], l.split('#')[0].strip()))
files = [(s, f) for s, f in files if f and ('/' in f or '.' in f) and not f.startswith('notes/') and 'grep' not in f]


def h(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


bad = []
miss = []
for s, f in files:
    cur = os.path.join(R, f)
    bk = os.path.join(B, f)
    if not os.path.exists(cur):
        miss.append(f)
        continue
    if s.startswith('=== A'):
        if not os.path.exists(bk) or h(cur) != h(bk):
            bad.append(f)
print('entries', len(files), 'missing_now', len(miss), 'A-not-identical', len(bad), bad[:5])
bc = sum(len(fs) for _, _, fs in os.walk(B))
print('backup files', bc)
listed = set(f for _, f in files)
ow = ['index.html', 'js/core/router.js', 'js/core/tg.js', 'js/manifest.js', 'js/pages/brightness.js',
      'js/pages/gid-conflict.js', 'js/pages/homography.js', 'js/pages/track-lifecycle.js']
print('overwritten-in-list', [o for o in ow if o in listed])
keep = []
for d, _, fs in os.walk(R):
    for fn in fs:
        rel = os.path.relpath(os.path.join(d, fn), R).replace(chr(92), '/')
        if rel not in listed and rel.endswith(('.html', '.js', '.css', '.mjs', '.py')) and not rel.startswith('assets'):
            keep.append(rel)
hits = 0
for k in keep:
    t = open(os.path.join(R, k), encoding='utf8', errors='ignore').read()
    for _, f in files:
        if f.endswith(('.js', '.css')) and f != k and (('/' + f) in t or ('"' + f) in t or ("'" + f) in t):
            print('REF', k, '->', f)
            hits += 1
            break
print('kept', len(keep), 'refs-to-deleted', hits)
