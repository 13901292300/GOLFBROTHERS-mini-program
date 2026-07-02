import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

FILES = [
    BASE / 'utils/groupsStore.js',
    BASE / 'pages/game/hub/index.js',
    BASE / 'pages/tournament/detail/index.js',
    BASE / 'pages/score/index.js',
]


def ensure_import(text, path):
    if 'mockAvatars' in text:
        return text
    req = "const mockAvatars = require('../../utils/mockAvatars.js');\n"
    if 'utils' in str(path):
        req = "const mockAvatars = require('./mockAvatars.js');\n"
    return req + text


def patch_line(line):
    if "avatar: 'https://" not in line and 'avatar: "https://' not in line:
        return line
    pid = re.search(r"playerId: '([^']+)'", line)
    name = re.search(r"name: '([^']+)'", line)
    seed = pid.group(1) if pid else (name.group(1) if name else 'seed')
    return re.sub(r"avatar: ['\"]https://[^'\"]+['\"]", f"avatar: mockAvatars.pickMockAvatar('{seed}')", line)


def patch_file(path):
    text = path.read_text(encoding='utf-8')
    text2 = ensure_import(text, path)
    lines = [patch_line(l) for l in text2.splitlines(True)]
    out = ''.join(lines)
    if out != text:
        path.write_text(out, encoding='utf-8')
        print('patched', path.name)


for f in FILES:
    if f.exists():
        patch_file(f)
