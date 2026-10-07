import re
doc = open('builder-b.md', encoding='utf-8').read()
parts = re.split(r'\n(?=#### )', doc)
out = []
for p in parts:
    m = re.match(r'#### ([A-F]\d+)\. (.+)', p)
    if not m:
        continue
    sid, title = m.group(1), m.group(2).strip()
    lines = ['### ' + sid + ' ' + title]
    for pat, tag in [(r'- \*\*Code\*\*:.*', 'CODE'), (r'- \*\*Input\*\*:.*', 'IO'),
                     (r'- \*\*Độ phức tạp[^\n]*', 'CPLX'), (r'- \*\*Cấu trúc\*\*:.*', 'STRUCT'),
                     (r'- \*\*Thư viện ngoài\*\*:.*', 'LIB')]:
        mm = re.search(pat, p)
        if mm:
            lines.append(tag + '| ' + mm.group(0)[:700])
    pc = re.findall(r'  \d+\. .*', p)
    lines.append('PSEUDO| ' + ' ;; '.join(x.strip() for x in pc)[:1500])
    for sm in re.finditer(r'\*\*Sample ([AB])[^*]*\*\*[^\n]*', p):
        label = sm.group(0)[:120]
        block = p[sm.end():sm.end() + 1200]
        jm = re.search(r'```json\s*(.*?)```', block, re.S)
        jtxt = jm.group(1) if jm else 'NONE'
        exp = re.search(r'\*\*Expected\*\*[^:]*:? ?(.*)', block)
        lines.append('SA' + sm.group(1) + '| ' + label + ' JSON: ' + jtxt[:700].replace('\n', ' '))
        if exp:
            lines.append('EX' + sm.group(1) + '| ' + exp.group(1)[:700])
    out.append('\n'.join(lines))
open('_ref_dump.txt', 'w', encoding='utf-8').write('\n\n'.join(out))
import os
print(os.path.getsize('_ref_dump.txt'), 'bytes;', len(out), 'sections')
