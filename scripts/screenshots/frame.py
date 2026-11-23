"""Turn capture.mjs output into captioned store screenshots and tutorial close-ups (WebP).

Play: fastlane/metadata/android/<locale>/images/phoneScreenshots (1080x1920). App Store: fastlane/screenshots/<locale>,
iPhone 6.9" (1320x2868) and iPad 13" (2064x2752); deliver picks the device type from the size.

Usage: python3 scripts/screenshots/frame.py [outDir]   (needs Pillow and DejaVu Sans Bold)
"""

import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/gdfu-screenshots")
REPO = Path(__file__).resolve().parents[2]
CAPTIONS = {
    "en-GB": ["Configure your radio link", "Find devices in range", "Choose validated firmware", "Follow update progress", "Confirm a successful update"],
    "pt-PT": ["Configure a ligação de rádio", "Encontre dispositivos ao alcance", "Escolha firmware validado", "Acompanhe a atualização", "Confirme o sucesso da atualização"],
    "pt-BR": ["Configure o link de rádio", "Encontre dispositivos ao alcance", "Escolha um firmware validado", "Acompanhe a atualização", "Confirme o sucesso da atualização"],
    "zh-Hans": ["配置无线链路", "发现范围内的设备", "选择经过验证的固件", "跟踪更新进度", "确认更新成功"],
    "fr": ["Configurez votre liaison radio", "Détectez les appareils à portée", "Choisissez un firmware validé", "Suivez la mise à jour", "Confirmez la mise à jour"],
    "de": ["Funkverbindung konfigurieren", "Geräte in Reichweite finden", "Geprüfte Firmware wählen", "Update-Fortschritt verfolgen", "Erfolgreiches Update bestätigen"],
    "ko": ["무선 링크 구성", "범위 내 장치 검색", "검증된 firmware 선택", "업데이트 진행 상황 확인", "업데이트 완료 확인"],
    "es": ["Configure el enlace de radio", "Detecte dispositivos al alcance", "Elija firmware validado", "Siga el progreso de la actualización", "Confirme la actualización"],
}
# App locale -> Google Play listing locale (fastlane/metadata/android/<play>/).
PLAY = {"zh-Hans": "zh-CN", "fr": "fr-FR", "de": "de-DE", "ko": "ko-KR", "es": "es-ES"}
# App locale -> App Store locale (fastlane/screenshots/<apple>/).
APPLE = {"fr": "fr-FR", "de": "de-DE", "es": "es-ES"}
# capture.mjs file prefix -> page size. "" is the Play phone; the prefix also names the App Store file.
DEVICES = {"": (1080, 1920), "iphone-": (1320, 2868), "ipad-": (2064, 2752)}
NAMES = ["01-proxy", "02-targets", "03-firmware", "04-update", "05-success"]
# ponytail: Debian font paths; pass other TTFs via FONT / CJK_FONT if needed.
FONT = os.environ.get("FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
CJK_FONT = os.environ.get("CJK_FONT", "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc")


def rounded(im: Image.Image, radius: int, box: tuple[int, int, int, int]) -> Image.Image:
    """Alpha mask with rounded corners over box."""
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius, fill=255)
    return mask


for locale, captions in CAPTIONS.items():
    (REPO / f"fastlane/metadata/android/{PLAY.get(locale, locale)}/images/phoneScreenshots").mkdir(parents=True, exist_ok=True)
    (REPO / f"public/tutorial/{locale}").mkdir(parents=True, exist_ok=True)
    (REPO / f"fastlane/screenshots/{APPLE.get(locale, locale)}").mkdir(parents=True, exist_ok=True)
    font = CJK_FONT if locale in ("zh-Hans", "ko") else FONT
    for dev, (w, h) in DEVICES.items():
        # The Play layout scaled to each size: caption band 1/16 of the height, shot flush with the bottom.
        band, k = h // 16, w / 1080
        out = REPO / (f"fastlane/metadata/android/{PLAY.get(locale, locale)}/images/phoneScreenshots" if not dev else f"fastlane/screenshots/{APPLE.get(locale, locale)}")
        for name, caption in zip(NAMES, captions):
            shot = Image.open(SRC / f"{locale}-{dev}{name}.png").convert("RGB")
            shot = shot.resize((round(shot.width * (h - band) / shot.height), h - band), Image.LANCZOS)
            page = Image.new("RGB", (w, h), "#0e1821")
            ImageDraw.Draw(page).text((w // 2, band // 2), caption, font=ImageFont.truetype(font, round(44 * k)), fill="#fafbfc", anchor="mm")
            page.paste(shot, ((w - shot.width) // 2, band), rounded(shot, round(28 * k), (0, 0, shot.width, shot.height + 40)))
            page.save(out / f"{dev}{name}.png", optimize=True)
    for name in NAMES[:4]:
        card = Image.open(SRC / f"{locale}-zoom-{name}.png").convert("RGB")
        card.putalpha(rounded(card, 24, (0, 0, *card.size)))
        card.save(REPO / f"public/tutorial/{locale}/{name}.webp", quality=85, method=6)
print("wrote fastlane/metadata/android/*/images/phoneScreenshots, fastlane/screenshots/* and public/tutorial/*")
