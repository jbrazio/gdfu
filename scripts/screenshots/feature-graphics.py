#!/usr/bin/env python3
"""Generate Play feature graphics (1024x500) and App Store universal creative assets (5244x2950, artwork
inside Apple's 1402x962 safe area so header and search crops keep it). Requires Pillow and fonttools;
see scripts/README.md."""
import os
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
COPY = {
    "en-GB": ("Firmware updates.", "Long-distance reach.", "Update nRF52840 devices", "over a GFSK radio link.", "GDFU proxy required for long-range updates."),
    "pt-PT": ("Actualize o firmware.", "Vá mais longe.", "Actualize dispositivos nRF52840", "por uma ligação de rádio GFSK.", "Proxy GDFU necessário para longo alcance."),
    "pt-BR": ("Actualize o firmware.", "Vá mais longe.", "Actualize dispositivos nRF52840", "por uma ligação de rádio GFSK.", "Proxy GDFU necessário para longo alcance."),
    "zh-CN": ("固件更新。", "远距离覆盖。", "通过 GFSK 无线链路", "更新 nRF52840 设备。", "远距离更新需要 GDFU proxy。"),
    "fr-FR": ("Mises à jour du firmware.", "Une portée étendue.", "Mettez à jour les appareils nRF52840", "via une liaison radio GFSK.", "Un proxy GDFU est requis pour les mises à jour à distance."),
    "de-DE": ("Firmware aktualisieren.", "Große Reichweite.", "nRF52840-Geräte über eine", "GFSK-Funkverbindung aktualisieren.", "Für Updates über große Entfernungen ist ein GDFU-Proxy erforderlich."),
    "ko-KR": ("펌웨어 업데이트.", "더 멀리 연결하세요.", "GFSK 무선 링크로", "nRF52840 기기를 업데이트하세요.", "장거리 업데이트에는 GDFU proxy가 필요합니다."),
    "es-ES": ("Actualizaciones de firmware.", "Mayor alcance.", "Actualice dispositivos nRF52840", "a través de un enlace de radio GFSK.", "Las actualizaciones de largo alcance requieren un proxy GDFU."),
}


def font_for(text, size, bold, locale, width=585):
    if locale in ("zh-CN", "ko-KR"):
        path = os.environ.get("CJK_FONT", "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc")
    else:
        path = os.environ.get("BOLD_FONT" if bold else "FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans" + ("-Bold" if bold else "") + ".ttf")
    with TTFont(path, fontNumber=0) as font:
        missing = {ord(c) for c in text if not c.isspace()} - set(font.getBestCmap())
    if missing:
        raise ValueError(f"{locale}: font {path} lacks glyphs: {sorted(missing)}")
    while size >= 12:
        font = ImageFont.truetype(path, size)
        if font.getlength(text) <= width:
            return font
        size -= 1
    raise ValueError(f"{locale}: text does not fit: {text}")


# Play language tag -> App Store locale, where they differ.
APPLE = {"zh-CN": "zh-Hans", "ko-KR": "ko"}
# Apple universal creative asset: canvas, safe-area offset and size.
UNIVERSAL, SAFE_AT, SAFE = (5244, 2950), (1921, 660), (1402, 962)

def render(icon, locale, lines, k=1.0):
    """The feature-graphic layout drawn at k times 1024x500, so larger outputs stay sharp."""
    s = lambda v: round(v * k)
    # Reuse the actual logo rather than approximating its custom lettering.
    logo = icon.convert("RGB").crop((55, 130, 455, 380)).resize((s(300), s(188)), Image.Resampling.LANCZOS)
    image = Image.new("RGB", (s(1024), s(500)), "#0e1821")
    image.paste(logo, (s(45), s(155)))
    draw = ImageDraw.Draw(image)
    for text, y, size, bold, colour in zip(lines, (116, 168, 257, 294, 399), (36, 36, 24, 24, 16), (True, True, False, False, False), ("#fafbfc", "#1cdbbc", "#fafbfc", "#fafbfc", "#a9bac5")):
        draw.text((s(405), s(y)), text, font=font_for(text, s(size), bold, locale, s(585)), fill=colour)
    return image

def universal(locale, headline):
    """Apple universal asset: logo left, the two headline lines right spanning the logo's height, as large as
    fits Apple's safe area (in view in every crop). Built from the 1024px icon so the logo stays sharp."""
    with Image.open(ROOT / "assets/icon-only.png") as icon:
        # Same crop as the feature graphic (512px icon), doubled for the 1024px source.
        logo = icon.convert("RGB").crop((110, 260, 910, 760))
    gap = 60
    def layout(logo_h):
        line_h = logo_h // 2
        fonts = [font_for(t, line_h, True, locale, 10**9) for t in headline]
        # Font size such that one line's cap-to-baseline block fills half the logo height.
        sizes = [round(line_h * 0.7 * line_h / (f.getbbox("H")[3] - f.getbbox("H")[1])) for f in fonts]
        fonts = [font_for(t, n, True, locale, 10**9) for t, n in zip(headline, sizes)]
        logo_w = round(logo.width * logo_h / logo.height)
        return line_h, fonts, logo_w, logo_w + gap + max(f.getlength(t) for f, t in zip(fonts, headline))

    # Largest size inside the safe area: width minus the gap scales with the logo height.
    width = layout(SAFE[1])[3]
    logo_h = min(SAFE[1], int(SAFE[1] * (SAFE[0] - gap) / (width - gap)))
    line_h, fonts, logo_w, width = layout(logo_h)
    while width > SAFE[0]:  # font size rounding
        logo_h -= 2
        line_h, fonts, logo_w, width = layout(logo_h)
    canvas = Image.new("RGB", UNIVERSAL, "#0e1821")
    x = SAFE_AT[0] + round((SAFE[0] - width) / 2)
    y = SAFE_AT[1] + (SAFE[1] - logo_h) // 2
    canvas.paste(logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS), (x, y))
    draw = ImageDraw.Draw(canvas)
    for i, (text, font, colour) in enumerate(zip(headline, fonts, ("#fafbfc", "#1cdbbc"))):
        draw.text((x + logo_w + gap, y + line_h * i + line_h // 2), text, font=font, fill=colour, anchor="lm")
    return canvas

def generate(output=ROOT / "fastlane/metadata/android", creative=ROOT / "fastlane/creative"):
    with Image.open(ROOT / "fastlane/metadata/android/icon.png") as icon:
        icon.load()
    for locale, lines in COPY.items():
        destination = output / locale / "images/featureGraphic.png"
        destination.parent.mkdir(parents=True, exist_ok=True)
        render(icon, locale, lines).save(destination, optimize=True)
        canvas = universal(locale, lines[:2])
        destination = creative / APPLE.get(locale, locale) / "universal.png"
        destination.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(destination, optimize=True)
        print(f"Generated {locale} feature graphic and universal creative asset")


if __name__ == "__main__":
    generate()
