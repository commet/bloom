#!/usr/bin/env python3
"""
페이지에 실제로 쓰인 글자만 남겨 웹폰트를 잘라내고, data: URI로 인라인할 수 있는
@font-face CSS를 만든다.

- Overpass (라틴/숫자, 사이니지 각인 역할): 웨이트별 단일 서브셋
- Gothic A1 (한글 디스플레이): fontsource가 100개 unicode-range 조각으로 쪼개 배포하므로
  조각마다 교집합만 남긴 뒤 하나로 병합한다. 조각당 폰트 테이블 오버헤드가 사라져
  용량이 1/2.5로 줄어든다.

사용: python3 tools/subset_fonts.py <charset.txt> <fonts-dir> <out.css>
"""
import base64
import io
import shutil
import sys
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

OVERPASS = [("Overpass", 600), ("Overpass", 700), ("Overpass", 800)]
GOTHIC = [("Gothic A1", 500), ("Gothic A1", 800)]

# 라틴 파트는 항상 포함 (UI 라벨, 숫자, 구두점이 조건부로 생성될 수 있으므로)
ALWAYS = set(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    " .,:;!?'\"()[]{}<>/\\|-–—_+=*&%#@~^`$·‘’“”…×→✓▸"
)


def opts():
    o = subset.Options()
    o.layout_features = ["*"]
    o.name_IDs = ["*"]
    o.name_legacy = True
    o.notdef_outline = True
    o.recalc_bounds = True
    o.drop_tables += ["FFTM"]
    o.desubroutinize = False
    return o


def cut(path: Path, chars: set) -> bytes | None:
    """폰트를 주어진 글자 집합으로 자른다. 남는 글리프가 없으면 None."""
    font = TTFont(str(path), fontNumber=0, lazy=False)
    have = set()
    for table in font["cmap"].tables:
        have |= set(table.cmap.keys())
    want = {ord(c) for c in chars} & have
    if not want:
        font.close()
        return None
    s = subset.Subsetter(options=opts())
    s.populate(unicodes=want)
    s.subset(font)
    font.flavor = "woff2"
    buf = io.BytesIO()
    font.save(buf)
    font.close()
    return buf.getvalue()


def cut_and_merge(paths: list[Path], chars: set, tmp: Path) -> bytes | None:
    """여러 unicode-range 조각을 각각 자른 뒤 하나의 폰트로 병합한다."""
    parts = []
    for i, src in enumerate(paths):
        data = cut(src, chars)
        if not data:
            continue
        f = TTFont(io.BytesIO(data))
        out = tmp / f"{i}.ttf"
        f.flavor = None
        f.save(str(out))
        f.close()
        parts.append(str(out))
    if not parts:
        return None
    merged = Merger().merge(parts) if len(parts) > 1 else TTFont(parts[0])
    merged.flavor = "woff2"
    buf = io.BytesIO()
    merged.save(buf)
    merged.close()
    return buf.getvalue()


def face(family: str, weight: int, data: bytes) -> str:
    b64 = base64.b64encode(data).decode()
    return (
        f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};"
        f"font-display:swap;\n  src:url(data:font/woff2;base64,{b64}) format('woff2')}}\n"
    )


def main():
    charset_file, fonts_dir, out_css = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    chars = set(Path(charset_file).read_text(encoding="utf-8")) | ALWAYS

    css, total = [], 0

    for family, w in OVERPASS:
        src = fonts_dir / "overpass" / f"overpass-latin-{w}-normal.woff2"
        data = cut(src, chars)
        if data:
            css.append(face(family, w, data))
            total += len(data)
            print(f"  Overpass {w}: {len(data) / 1024:.1f} KB")

    tmp = out_css.parent / ".fontparts"
    for family, w in GOTHIC:
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir(parents=True, exist_ok=True)
        paths = [p for i in range(200) if (p := fonts_dir / "gothic" / f"gothic-a1-{i}-{w}-normal.woff2").exists()]
        data = cut_and_merge(paths, chars, tmp)
        if data:
            css.append(face(family, w, data))
            total += len(data)
            print(f"  Gothic A1 {w}: {len(paths)} subsets 병합, {len(data) / 1024:.1f} KB")
    shutil.rmtree(tmp, ignore_errors=True)

    out_css.parent.mkdir(parents=True, exist_ok=True)
    out_css.write_text("".join(css), encoding="utf-8")
    print(f"  woff2 총합 {total / 1024:.1f} KB → base64 {out_css.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
