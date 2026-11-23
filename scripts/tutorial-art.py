"""Lofi low-poly SVG illustrations for the tutorial's setup slides (language-neutral, shared by all locales).

Usage: python3 scripts/tutorial-art.py   -> public/tutorial/00-*.svg
"""

import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public/tutorial"
W, H = 600, 800  # portrait: fills the tutorial's image area on phones
NAVY, MINT, WHITE, GREY, ORANGE = "#0e1821", "#2ce8be", "#fafbfc", "#aab9c5", "#f39200"
DUSK = [(0, "#161c36"), (0.45, "#3b3563"), (0.75, "#8a5577"), (1, "#e49a7c")]  # lofi dusk sky
rnd = random.Random(7)


def mix(a: str, b: str, t: float) -> str:
    ca, cb = ([int(h[i : i + 2], 16) for i in (1, 3, 5)] for h in (a, b))
    t = min(1, max(0, t))
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(ca, cb))


def shade(c: str, k: float) -> str:
    """k > 0 towards white, k < 0 towards black."""
    return mix(c, "#ffffff", k) if k > 0 else mix(c, "#000000", -k)


def ramp(stops, t: float) -> str:
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t <= t1:
            return mix(c0, c1, (t - t0) / (t1 - t0))
    return stops[-1][1]


def tri(pts, fill: str) -> str:
    p = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    return f'<polygon points="{p}" fill="{fill}" stroke="{fill}" stroke-width=".7" stroke-linejoin="round"/>'


def grid(x, y, w, h, nx, ny, jit):
    g = [[(x + w * i / nx, y + h * j / ny) for j in range(ny + 1)] for i in range(nx + 1)]
    for i in range(1, nx):
        for j in range(1, ny):
            g[i][j] = (g[i][j][0] + rnd.uniform(-jit, jit) * w / nx, g[i][j][1] + rnd.uniform(-jit, jit) * h / ny)
    for i in range(nx):
        for j in range(ny):
            a, b, c, d = g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]
            yield from ((a, b, c), (a, c, d)) if (i + j) % 2 else ((a, b, d), (b, c, d))


def gradient(x, y, w, h, stops, nx=8, ny=10, noise=0.035):
    """Faceted vertical gradient (sky, wall, desk)."""
    return "".join(tri(t, shade(ramp(stops, (sum(p[1] for p in t) / 3 - y) / h), rnd.uniform(-noise, noise))) for t in grid(x, y, w, h, nx, ny, 0.45))


def quad(p0, p1, p2, p3, color, nx=3, ny=2, contrast=0.12):
    """Faceted quad (clockwise from top-left), lit from the top-left."""

    def at(u, v):
        tx, ty = p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u
        bx, by = p3[0] + (p2[0] - p3[0]) * u, p3[1] + (p2[1] - p3[1]) * u
        return tx + (bx - tx) * v, ty + (by - ty) * v

    out = []
    for t in grid(0, 0, 1, 1, nx, ny, 0.3):
        u, v = sum(p[0] for p in t) / 3, sum(p[1] for p in t) / 3
        out.append(tri([at(*p) for p in t], shade(color, contrast * (1 - u - v) + rnd.uniform(-0.03, 0.03))))
    return "".join(out)


def rect(x, y, w, h, color, **kw):
    return quad((x, y), (x + w, y), (x + w, y + h), (x, y + h), color, **kw)


def disc(cx, cy, r, color, n=8):
    pts = [(cx + r * math.cos(2 * math.pi * i / n - 2.4), cy + r * math.sin(2 * math.pi * i / n - 2.4)) for i in range(n)]
    return "".join(tri([(cx, cy), pts[i], pts[(i + 1) % n]], shade(color, 0.14 - 0.28 * i / (n - 1))) for i in range(n))


def ridge(points, base, color, light=0.07):
    """Low-poly hill: ridge points down to a flat base, faces shaded by slope."""
    mids = [(x + rnd.uniform(-12, 12), (y + base) / 2 + rnd.uniform(-10, 10)) for x, y in points]
    out = []
    for i in range(len(points) - 1):
        (p, q), (m, n) = points[i : i + 2], mids[i : i + 2]
        k = light if q[1] > p[1] else -light
        out += [tri((p, q, n), shade(color, k)), tri((p, n, m), shade(color, k / 2))]
        out += [tri((m, n, (n[0], base)), shade(color, -0.05)), tri((m, (n[0], base), (m[0], base)), shade(color, -0.08))]
    return "".join(out)


def text(x, y, s, size=20, fill=WHITE, anchor="middle", weight=700):
    return f'<text x="{x}" y="{y}" font-family="DejaVu Sans, Roboto, Arial, sans-serif" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{s}</text>'


def pill(x, y, s, fill=MINT, ink=NAVY, size=18):
    w = len(s) * size * 0.62 + 24
    return f'<rect x="{x - w / 2:.1f}" y="{y - size}" width="{w:.1f}" height="{size * 1.7:.1f}" rx="{size * 0.85:.1f}" fill="{fill}"/>' + text(x, y + size * 0.15, s, size, ink)


def place(body, x, y, s=1.0):
    return f'<g transform="translate({x} {y}) scale({s})">{body}</g>'


def glow(cx, cy, rx, ry, color=MINT, op=0.18):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{color}" opacity="{op}"/>'


def stars(n, x0, y0, x1, y1):
    return "".join(f'<circle cx="{rnd.uniform(x0, x1):.0f}" cy="{rnd.uniform(y0, y1):.0f}" r="{rnd.choice((1, 1, 1.5, 2))}" fill="#f5e9d8" opacity="{rnd.uniform(.35, .9):.2f}"/>' for _ in range(n))


def moon(cx, cy, r):
    return glow(cx, cy, r * 2.2, r * 2.2, "#f5e1c8", 0.12) + disc(cx, cy, r, "#f5e1c8", n=9)


GRAIN = (
    '<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/>'
    '<feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .09"/></feComponentTransfer></filter>'
)


def svg(name, body):
    OUT.mkdir(parents=True, exist_ok=True)
    grain = f'<rect width="{W}" height="{H}" filter="url(#grain)"/>'
    (OUT / name).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}"><defs>{GRAIN}</defs>{body}{grain}</svg>\n')


# --- devices (drawn at the origin; position with place()) ---------------------------------------


def phone():
    """Phone running the app: 110 x 200."""
    s = rect(0, 0, 110, 200, "#2a3045", nx=2, ny=4)
    s += rect(8, 16, 94, 166, "#e9eef2", nx=2, ny=4, contrast=0.08)
    for i in range(4):
        s += rect(14, 26 + i * 38, 82, 30, MINT if i == 0 else "#ffffff", nx=2, ny=1, contrast=0.1)
        s += rect(20, 34 + i * 38, 14, 14, NAVY if i == 0 else "#0e8167", nx=1, ny=1)
        s += rect(40, 37 + i * 38, 46 - i * 6, 8, "#7d8c99", nx=1, ny=1, contrast=0.05)
    return s + disc(55, 191, 5, "#7d8c99", n=6)


def heltec():
    """Heltec WiFi LoRa 32 V3: 180 x 100 board, antenna on the left, USB-C port at (180..198, 36..64)."""
    s = rect(-18, -70, 9, 90, "#c9d3da", nx=1, ny=3) + disc(-13.5, -74, 9, "#c9d3da", n=6)
    s += rect(-22, 12, 26, 20, "#d9b84a", nx=1, ny=1)
    s += rect(0, 0, 180, 100, "#2b3a4a", nx=4, ny=2)
    s += rect(22, 14, 92, 58, "#0a1016", nx=2, ny=2, contrast=0.08)
    s += rect(30, 24, 50, 7, MINT, nx=1, ny=1, contrast=0.05)
    s += rect(30, 38, 70, 5, "#3bb89a", nx=1, ny=1, contrast=0.05) + rect(30, 50, 40, 5, "#3bb89a", nx=1, ny=1, contrast=0.05)
    s += rect(126, 22, 40, 40, GREY, nx=2, ny=2)
    s += rect(180, 36, 18, 28, "#8796a3", nx=1, ny=1)
    return s + disc(140, 82, 6, WHITE, n=6) + disc(160, 82, 6, WHITE, n=6) + text(90, 128, "Heltec V3", 17, "#e8dfe8")


def sensecap():
    """SenseCAP Solar P1: ~150 x 210, antenna on top, USB-C at the bottom (60..90, 196..206), button at (30, 160)."""
    s = rect(112, -40, 10, 110, "#3a4058", nx=1, ny=3) + disc(117, -42, 7, "#3a4058", n=6)
    s += quad((6, 40), (144, 40), (150, 210), (0, 210), "#e7edf1", nx=3, ny=4)
    s += quad((-10, 20), (160, 20), (146, 110), (4, 110), "#2c4f8c", nx=4, ny=3, contrast=0.2)
    for i in range(1, 4):
        s += f'<line x1="{-10 + i * 41:.1f}" y1="20" x2="{4 + i * 35.5:.1f}" y2="110" stroke="#8fb0de" stroke-width="1.5" opacity=".55"/>'
    s += '<line x1="-3" y1="65" x2="153" y2="65" stroke="#8fb0de" stroke-width="1.5" opacity=".55"/>'
    s += rect(60, 196, 30, 10, "#8796a3", nx=1, ny=1)
    return s + disc(30, 160, 8, MINT, n=8)


def laptop(title, accent):
    """Laptop: screen 300 x 190 at the origin, content area (12, 40)-(288, 178), base below to y=222."""
    s = rect(0, 0, 300, 190, "#2a3045", nx=4, ny=3)
    s += rect(12, 12, 276, 166, "#eef1f4", nx=3, ny=2, contrast=0.06)
    s += rect(12, 12, 276, 26, accent, nx=3, ny=1, contrast=0.1) + text(150, 31, title, 15, NAVY)
    return s + quad((-20, 190), (320, 190), (344, 222), (-44, 222), "#454b66", nx=5, ny=1)


def doc(ext, color):
    """File icon 60 x 76 with a folded corner."""
    s = quad((0, 0), (42, 0), (60, 18), (0, 18), color, nx=1, ny=1) + rect(0, 18, 60, 58, color, nx=1, ny=2)
    s += tri([(42, 0), (60, 18), (42, 18)], shade(color, -0.25))
    return s + rect(-6, 40, 72, 24, NAVY, nx=1, ny=1, contrast=0.05) + text(30, 58, ext, 16, color)


def cable(d, plugs):
    """USB cable along SVG path d, with a plug body at each (x, y, w, h)."""
    s = f'<path d="{d}" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="12" stroke-linecap="round" transform="translate(0 5)"/>'
    s += f'<path d="{d}" fill="none" stroke="#b9b4cc" stroke-width="9" stroke-linecap="round"/>'
    s += f'<path d="{d}" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="2.5" stroke-linecap="round" transform="translate(-1 -2)"/>'
    return s + "".join(rect(x, y, w, h, "#dcd8e6", nx=1, ny=1, contrast=0.2) for x, y, w, h in plugs)


def arrow(x1, y1, x2, y2, color=MINT):
    a = math.atan2(y2 - y1, x2 - x1)
    h = [(x2, y2), (x2 - 18 * math.cos(a - 0.5), y2 - 18 * math.sin(a - 0.5)), (x2 - 18 * math.cos(a + 0.5), y2 - 18 * math.sin(a + 0.5))]
    return f'<line x1="{x1}" y1="{y1}" x2="{x2 - 10 * math.cos(a):.1f}" y2="{y2 - 10 * math.sin(a):.1f}" stroke="{color}" stroke-width="6" stroke-linecap="round"/>' + tri(h, color)


def link(x1, y1, x2, y2, label, sub):
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    return (
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{MINT}" stroke-width="4" stroke-dasharray="4 11" stroke-linecap="round"/>'
        + pill(mx, my, label)
        + text(mx, my + 34, sub, 15, "#f5e9d8", weight=400)
    )


def room():
    """Lofi room: wall, dusk window with hills and moon, desk."""
    s = gradient(0, 0, W, 560, [(0, "#29243f"), (1, "#3b3256")], nx=6, ny=6)
    s += '<clipPath id="win"><rect x="70" y="50" width="460" height="300"/></clipPath><g clip-path="url(#win)">'
    s += gradient(70, 50, 460, 300, DUSK, nx=7, ny=5) + stars(25, 80, 55, 520, 200) + moon(440, 120, 26)
    s += ridge([(60, 300), (150, 250), (230, 285), (330, 230), (430, 280), (540, 240)], 360, "#4b3b68")
    s += ridge([(60, 330), (180, 300), (300, 325), (400, 295), (540, 320)], 360, "#33294f") + "</g>"
    s += '<rect x="63" y="43" width="474" height="314" fill="none" stroke="#54476f" stroke-width="14"/>'
    s += rect(52, 350, 496, 16, "#5e5079", nx=4, ny=1)  # sill
    s += gradient(0, 520, W, 280, [(0, "#7a5662"), (1, "#4c3443")], nx=6, ny=3) + rect(0, 514, W, 10, "#946a74", nx=6, ny=1)
    return s


def mug(x, y):
    s = rect(x, y, 46, 54, "#e3c6b4", nx=1, ny=2) + f'<path d="M{x + 46} {y + 12} q18 4 0 26" fill="none" stroke="#e3c6b4" stroke-width="6"/>'
    return s + "".join(f'<path d="M{x + 12 + i * 12} {y - 8} q-8 -12 0 -24 q8 -12 0 -24" fill="none" stroke="#f5e9d8" stroke-width="3" stroke-linecap="round" opacity=".45"/>' for i in range(2))


def plant(x, y):
    s = ""
    for dx, dy, c in ((-26, -60, "#3f8f75"), (4, -78, "#52a985"), (30, -58, "#3f8f75"), (16, -40, "#2f6f5b")):
        s += tri([(x + 25, y + 2), (x + 25 + dx, y + dy), (x + 25 + dx * 0.3 + 8, y + dy * 0.6)], c)
    return s + quad((x, y), (x + 50, y), (x + 42, y + 44), (x + 8, y + 44), "#c27a5a", nx=1, ny=1)


# 1. Overview: phone --BLE--> Heltec V3 proxy --GFSK--> SenseCAP P1 repeater on a far hilltop.
svg(
    "00-overview.svg",
    gradient(0, 0, W, H, DUSK, nx=8, ny=10)
    + stars(60, 0, 0, W, 360)
    + moon(110, 110, 34)
    + ridge([(-10, 520), (90, 450), (200, 490), (320, 400), (470, 330), (560, 380), (610, 360)], H, "#4b3b68")
    + ridge([(-10, 600), (120, 520), (260, 580), (400, 540), (610, 600)], H, "#36294f")
    + ridge([(-10, 700), (150, 660), (330, 700), (480, 650), (610, 690)], H, "#241c3a")
    + glow(478, 318, 90, 16)
    + place(sensecap(), 410, 110, 0.9)
    + text(478, 350, "SenseCAP P1", 17, "#f5e9d8")
    + glow(150, 500, 120, 20)
    + place(heltec(), 60, 380)
    + glow(445, 768, 80, 12)
    + place(phone(), 390, 560, 0.95)
    + text(445, 790, "gdfu", 17, "#f5e9d8")
    + link(270, 470, 385, 600, "BLE", "Bluetooth")
    + link(210, 360, 400, 250, "GFSK", "433 / 868 MHz"),
)

# 2. Proxy firmware: merged.bin in the meshcore.pt web flasher, laptop USB to the Heltec V3's USB-C.
svg(
    "00-proxy-flash.svg",
    room()
    + place(laptop("meshcore.pt", ORANGE), 150, 300)
    + '<rect x="180" y="352" width="240" height="118" rx="8" fill="none" stroke="#9aa6b2" stroke-width="2.5" stroke-dasharray="8 6"/>'
    + place(doc(".bin", "#0e8167"), 205, 372)
    + text(345, 395, "ESP32", 16, "#0e8167")
    + pill(345, 432, "merged.bin", fill=GREY, size=15)
    + mug(40, 560)
    + plant(150, 620)
    + place(heltec(), 280, 640)
    + cable("M490 510 C590 510 590 690 504 690", [(484, 503, 22, 14), (476, 682, 28, 16)])
    + pill(560, 610, "USB"),
)

# 3. Repeater bootloader: laptop USB to the SenseCAP's USB-C, double-press reset, drag the .uf2 onto the drive.
svg(
    "00-bootloader.svg",
    room()
    + place(laptop("UF2", MINT), 150, 300)
    + place(doc(".uf2", ORANGE), 185, 360)
    + arrow(262, 400, 330, 400)
    + rect(345, 365, 60, 74, "#7d8c99", nx=1, ny=2)
    + rect(357, 352, 36, 14, "#7d8c99", nx=1, ny=1)
    + mug(220, 575)
    + plant(40, 610)
    + cable("M110 510 C20 520 30 774 240 774 S475 790 475 784", [(108, 503, 22, 14), (467, 764, 16, 20)])
    + pill(260, 776, "USB")
    + place(sensecap(), 400, 560)
    + f'<circle cx="430" cy="720" r="20" fill="none" stroke="{ORANGE}" stroke-width="4" opacity=".85"/>'
    + f'<circle cx="430" cy="720" r="32" fill="none" stroke="{ORANGE}" stroke-width="3" opacity=".5"/>'
    + text(350, 704, "RESET", 15, "#f5e9d8")
    + text(350, 738, "×2", 30, ORANGE),
)
print(f"wrote {OUT}/00-*.svg")
