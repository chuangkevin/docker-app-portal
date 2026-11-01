#!/usr/bin/env python3
"""從 macOS 系統字體產生網頁字型切片（public/fonts/）與 public/fonts.css。

只能在 Mac 上跑。需要：fonttools、brotli、pyobjc-framework-CoreText。
  python3 scripts/build-fonts.py

- SF Pro（SFNS.ttf，可變字重 1–1000）：拉丁／希臘／西里爾＋符號，一個檔。
- SF Mono：ASCII＋拉丁補充，一個檔。
- 蘋方 TC：macOS 27 的 PingFangUI.ttc 外框是 Apple 專用 hvgl 格式，fonttools 讀不了，
  所以改用 CoreText 把每個字的外框畫出來，重組成 CFF 字型（Regular／Medium／Semibold 三個字重），
  再依 unicode-range 切片：瀏覽器只下載畫面用到的切片，任何作業系統都不會缺字。
  Big5 常用字（5401 字）每 160 字一片，其餘每 400 字一片。
"""
import io
import json
from pathlib import Path

import CoreText
import Quartz
from fontTools import subset
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.ttLib import TTCollection, TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'fonts'
SF = '/System/Library/Fonts/SFNS.ttf'
SFMONO = '/System/Library/Fonts/SFNSMono.ttf'
PINGFANG = '/System/Library/PrivateFrameworks/FontServices.framework/Versions/A/Resources/Reserved/PingFangUI.ttc'
PINGFANG_TC_INDEX = 21
PINGFANG_WEIGHTS = {400: 'PingFangTC-Regular', 500: 'PingFangTC-Medium', 600: 'PingFangTC-Semibold'}
UPM = 1000


def ranges(cps):
    cps = sorted(cps)
    out, start, prev = [], cps[0], cps[0]
    for c in cps[1:]:
        if c == prev + 1:
            prev = c
            continue
        out.append((start, prev))
        start = prev = c
    out.append((start, prev))
    return ', '.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a, b in out)


def save_subset(font_bytes, cps, path):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=cps)
    f = TTFont(io.BytesIO(font_bytes))
    sub.subset(f)
    f.flavor = 'woff2'
    f.save(path)
    return path.stat().st_size


def big5_level1():
    cps = []
    for hi in range(0xA4, 0xC7):
        for lo in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
            if (hi, lo) > (0xC6, 0x7E):
                break
            try:
                cps.append(ord(bytes([hi, lo]).decode('big5')))
            except UnicodeDecodeError:
                pass
    return cps


def glyph_charstring(ct_font, gid, advance):
    pen = T2CharStringPen(advance, None)
    path = CoreText.CTFontCreatePathForGlyph(ct_font, gid, None)
    state = {'open': False}

    def element(_info, el):
        t, pts = el.type, el.points
        if t == Quartz.kCGPathElementMoveToPoint:
            if state['open']:
                pen.closePath()
            pen.moveTo((pts[0].x, pts[0].y))
            state['open'] = True
        elif t == Quartz.kCGPathElementAddLineToPoint:
            pen.lineTo((pts[0].x, pts[0].y))
        elif t == Quartz.kCGPathElementAddQuadCurveToPoint:
            pen.qCurveTo((pts[0].x, pts[0].y), (pts[1].x, pts[1].y))
        elif t == Quartz.kCGPathElementAddCurveToPoint:
            pen.curveTo((pts[0].x, pts[0].y), (pts[1].x, pts[1].y), (pts[2].x, pts[2].y))
        elif t == Quartz.kCGPathElementCloseSubpath:
            pen.closePath()
            state['open'] = False

    if path is not None:
        Quartz.CGPathApply(path, None, element)
        if state['open']:
            pen.closePath()
    return pen.getCharString()


def rebuild_pingfang(ps_name, cps):
    """用 CoreText 取外框，重建成一般 CFF（OTF）字型，回傳 bytes。"""
    ct = CoreText.CTFontCreateWithName(ps_name, UPM, None)
    glyph_order, cmap, charstrings, metrics = ['.notdef'], {}, {}, {}
    empty = T2CharStringPen(UPM, None)
    charstrings['.notdef'] = empty.getCharString()
    metrics['.notdef'] = (UPM, 0)
    for cp in cps:
        ch = chr(cp)
        ok, glyphs = CoreText.CTFontGetGlyphsForCharacters(ct, ch, None, len(ch.encode('utf-16-le')) // 2)
        if not ok or not glyphs[0]:
            continue
        gid = glyphs[0]
        name = f'uni{cp:04X}' if cp <= 0xFFFF else f'u{cp:05X}'
        adv = round(CoreText.CTFontGetAdvancesForGlyphs(ct, CoreText.kCTFontOrientationHorizontal, [gid], None, 1)[0])
        charstrings[name] = glyph_charstring(ct, gid, adv)
        glyph_order.append(name)
        cmap[cp] = name
        rects = CoreText.CTFontGetBoundingRectsForGlyphs(ct, CoreText.kCTFontOrientationHorizontal, [gid], None, 1)
        metrics[name] = (adv, round(rects[1][0].origin.x))
    fb = FontBuilder(UPM, isTTF=False)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    family = 'PingFang TC'
    style = ps_name.split('-')[1]
    fb.setupCFF(ps_name, {'FullName': f'{family} {style}'}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    asc, desc = round(CoreText.CTFontGetAscent(ct)), round(CoreText.CTFontGetDescent(ct))
    fb.setupHorizontalHeader(ascent=asc, descent=-desc)
    fb.setupNameTable({'familyName': family, 'styleName': style})
    fb.setupOS2(sTypoAscender=asc, sTypoDescender=-desc, usWinAscent=asc, usWinDescent=desc,
                usWeightClass=[k for k, v in PINGFANG_WEIGHTS.items() if v == ps_name][0])
    fb.setupPost()
    buf = io.BytesIO()
    fb.save(buf)
    return buf.getvalue()


def face(family, file, weight, urange):
    return (f"@font-face{{font-family:'{family}';src:url('/fonts/{file}') format('woff2');"
            f"font-weight:{weight};font-style:normal;font-display:swap;unicode-range:{urange};}}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.woff2'):
        old.unlink()
    css, total, files = [], 0, 0

    sf_cps = [c for c in TTFont(SF).getBestCmap() if c < 0x3000]
    # 常用拉丁與標點一片（幾乎每頁都用到），其他（希臘、西里爾、符號）另一片，用到才下載
    basic = [c for c in sf_cps if c <= 0xFF or 0x2000 <= c <= 0x206F or c in (0x20AC, 0x2122, 0x2190, 0x2192, 0x2318, 0x21B5)]
    other = [c for c in sf_cps if c not in set(basic)]
    sf_bytes = Path(SF).read_bytes()
    total += save_subset(sf_bytes, basic, OUT / 'sf-pro-basic.woff2')
    css.append(face('SF Pro', 'sf-pro-basic.woff2', '1 1000', ranges(basic)))
    total += save_subset(sf_bytes, other, OUT / 'sf-pro-ext.woff2')
    css.append(face('SF Pro', 'sf-pro-ext.woff2', '1 1000', ranges(other)))
    files += 1
    mono_cps = [c for c in TTFont(SFMONO).getBestCmap() if c < 0x250]
    total += save_subset(Path(SFMONO).read_bytes(), mono_cps, OUT / 'sf-mono.woff2')
    css.append(face('SF Mono', 'sf-mono.woff2', '100 900', ranges(mono_cps)))
    files += 2

    pf_cps = set(TTCollection(PINGFANG).fonts[PINGFANG_TC_INDEX].getBestCmap())
    common = [c for c in big5_level1() if c in pf_cps]
    rest = sorted(pf_cps - set(common) - set(sf_cps))
    chunks = [common[i:i + 160] for i in range(0, len(common), 160)]
    chunks += [rest[i:i + 400] for i in range(0, len(rest), 400)]
    for weight, ps_name in PINGFANG_WEIGHTS.items():
        full = rebuild_pingfang(ps_name, sorted(pf_cps - set(sf_cps)))
        for i, cps in enumerate(chunks):
            name = f'pingfang-tc-{weight}-{i:03d}.woff2'
            total += save_subset(full, cps, OUT / name)
            css.append(face('PingFang TC', name, str(weight), ranges(cps)))
            files += 1

    (ROOT / 'public' / 'fonts.css').write_text(
        '/* 由 scripts/build-fonts.py 產生，不要手改 */\n' + '\n'.join(css) + '\n', encoding='utf-8')
    print(json.dumps({'files': files, 'chunks_per_weight': len(chunks), 'total_mb': round(total / 1e6, 1)}))


if __name__ == '__main__':
    main()
