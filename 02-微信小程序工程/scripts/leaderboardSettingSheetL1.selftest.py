# -*- coding: utf-8 -*-
"""Patch L1 selftest (Python fallback when node unavailable)."""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent / "miniprogram"
comp = root / "components" / "leaderboard-setting-sheet"
detail = root / "subpackages" / "tournament" / "pages" / "detail"
series = root / "subpackages" / "tournament" / "pages" / "series-detail"

comp_wxml = (comp / "index.wxml").read_text(encoding="utf-8")
comp_wxss = (comp / "index.wxss").read_text(encoding="utf-8")
comp_js = (comp / "index.js").read_text(encoding="utf-8")
detail_wxml = (detail / "index.wxml").read_text(encoding="utf-8")
detail_wxss = (detail / "index.wxss").read_text(encoding="utf-8")
detail_js = (detail / "index.js").read_text(encoding="utf-8")
series_wxml = (series / "index.wxml").read_text(encoding="utf-8")
series_wxss = (series / "index.wxss").read_text(encoding="utf-8")
series_js = (series / "index.js").read_text(encoding="utf-8")

passed = 0
failed = 0


def assert_(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print("PASS  " + name)
    else:
        failed += 1
        print("FAIL  " + name + ((" :: " + detail) if detail else ""))


assert_(
    "1 shared component",
    "leaderboard-setting-sheet" in detail_wxml
    and "leaderboard-setting-sheet" in series_wxml,
)
assert_(
    "2 host placement",
    re.search(
        r"series-layer-l2-host[\s\S]*leaderboard-setting-sheet", series_wxml
    )
    is not None
    and re.search(
        r'class="detail-scroll"[\s\S]*?</scroll-view>[\s\S]*leaderboard-setting-sheet',
        detail_wxml,
    )
    is not None,
)
assert_(
    "3 overlay+sheet+isolated",
    'class="sheet-overlay"' in comp_wxml
    and "bottom-sheet leaderboard-setting-sheet" in comp_wxml
    and "styleIsolation: 'isolated'" in comp_js,
)
assert_(
    "4 overlay dark fixed",
    "position: fixed" in comp_wxss
    and "inset: 0" in comp_wxss
    and re.search(
        r"background:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.55\s*\)", comp_wxss
    )
    is not None,
)
assert_(
    "5 z-index 210/230 no host opacity",
    "z-index: 210" in comp_wxss
    and "z-index: 230" in comp_wxss
    and re.search(r"\.bottom-sheet\s*\{[^}]*opacity\s*:", comp_wxss) is None,
)
assert_(
    "6 header padding + handle",
    re.search(
        r"\.leaderboard-setting__head\s*\{[\s\S]*?padding:\s*8rpx\s+0\s+32rpx",
        comp_wxss,
    )
    is not None
    and re.search(
        r"\.sheet-handle\s*\{[\s\S]*?margin:\s*24rpx\s+auto\s+40rpx", comp_wxss
    )
    is not None,
)
assert_(
    "7 catchtouchmove close",
    'catchtouchmove="noop"' in comp_wxml
    and 'bindtap="onMaskTap"' in comp_wxml
    and "triggerEvent('close')" in comp_js,
)
assert_(
    "8 detail no duplicate styles",
    ".leaderboard-setting__head" not in detail_wxss
    and ".leaderboard-setting-option" not in detail_wxss,
)
assert_(
    "9 series host fixed",
    re.search(
        r"series-layer-l2-host\s*\{[\s\S]*?position:\s*fixed[\s\S]*?inset:\s*0",
        series_wxss,
    )
    is not None
    and "pointer-events: none" in series_wxss,
)
assert_(
    "10 M switch",
    re.search(
        r"openLeaderboardSettingSheet\(\)[\s\S]{0,1200}showMoreSheet:\s*false[\s\S]{0,400}showLeaderboardSettingSheet:\s*true",
        detail_js,
    )
    is not None
    and re.search(
        r"_openSeriesRoundLeaderboardSettingSheet:[\s\S]{0,2500}_openFromManageSheet\(",
        series_js,
    )
    is not None
    and re.search(
        r"_openFromManageSheet:[\s\S]{0,600}isManageOverlayActive\s*=\s*true",
        series_js,
    )
    is not None,
)
assert_(
    "11 events",
    'bind:change="onLeaderboardSettingChange"' in detail_wxml
    and 'bind:confirm="confirmLeaderboardSettingSheet"' in series_wxml,
)
assert_(
    "12 safe-area bottom only",
    "calc(40rpx + env(safe-area-inset-bottom))" in comp_wxss
    and re.search(r"\.leaderboard-setting__head[\s\S]{0,200}safe-area", comp_wxss)
    is None,
)

print("")
print("L1 selftest: %d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
