# -*- coding: utf-8 -*-
"""Thin wrapper: prefer Cursor helper node for R-STATE JS selftest."""
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
JS = HERE / "seriesRoundVisualStateRState.selftest.js"
NODE_CANDIDATES = [
    Path(os.environ.get("LOCALAPPDATA", ""))
    / "Programs"
    / "cursor"
    / "resources"
    / "app"
    / "resources"
    / "helpers"
    / "node.exe",
    Path(os.environ.get("LOCALAPPDATA", ""))
    / "Programs"
    / "cursor"
    / "_"
    / "resources"
    / "app"
    / "resources"
    / "helpers"
    / "node.exe",
]


def main():
    node = None
    for p in NODE_CANDIDATES:
        if p.is_file():
            node = p
            break
    if node is None:
        print("SKIP  node not found; run seriesRoundVisualStateRState.selftest.js with node")
        return 0
    return subprocess.call([str(node), str(JS)], cwd=str(HERE.parent))


if __name__ == "__main__":
    sys.exit(main())
