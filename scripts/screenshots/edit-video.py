"""Edit the emulator recording into the 1920x1080 Play promo video: brand intro, one captioned
segment per step (phone on the right), the long transfer sped up, brand outro.

Usage: python3 edit-video.py <raw.mp4> <marks.json> <out.mp4>   (needs Pillow, ffmpeg, DejaVu fonts)
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

raw, marks_path, out = sys.argv[1:4]
REPO = Path(__file__).resolve().parents[2]
FONTS = os.environ.get("FONTS", "/usr/share/fonts/truetype/dejavu")
NAVY, WHITE, MINT, GREY = "#0e1821", "#fafbfc", "#2ee6c0", "#93a4b3"
W, H, FPS = 1920, 1080, 30
PHONE_H = 960
PHONE_W = round(PHONE_H * 1080 / 2400 / 2) * 2
TRANSFER_SECONDS = 10  # ponytail: the real transfer + reboot wait (~85 s) is squeezed into this

STEPS = {
    "proxy": ("Connect to the proxy", "Scan, connect and pick the radio profile."),
    "targets": ("Find devices in range", "Discover bootloader targets over radio."),
    "firmware": ("Get the firmware", "Download a release. It stays saved for offline use."),
    "update": ("Send it over the air", "Start the update and follow its progress."),
    "transfer": ("Send it over the air", "Start the update and follow its progress."),
    "done": ("Done", "Firmware verified. The device reboots on its own."),
}


def font(bold: bool, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(f"{FONTS}/DejaVuSans{'-Bold' if bold else ''}.ttf", size)


def background(title: str | None, body: str | None, path: Path) -> None:
    """Navy slide; with a title it leaves room for the phone on the right."""
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    if title is None:  # intro / outro: the store feature graphic, centred
        feature = Image.open(REPO / "fastlane/metadata/android/en-GB/images/featureGraphic.png").convert("RGB")
        feature = feature.resize((W, round(feature.height * W / feature.width)), Image.LANCZOS)
        img.paste(feature, (0, (H - feature.height) // 2))
    else:
        d.text((140, 170), "GFSK DFU", font=font(True, 36), fill=MINT)
        d.text((140, 360), title, font=font(True, 76), fill=WHITE)
        d.text((140, 480), body, font=font(False, 38), fill=WHITE)
        d.text((140, 900), "Demonstration with a simulated proxy and target.", font=font(False, 28), fill=GREY)
    img.save(path)


def run(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


marks = json.load(open(marks_path))
with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    parts: list[Path] = []

    def still(name: str, seconds: float) -> None:
        bg, part = tmp / f"{name}.png", tmp / f"{name}.mp4"
        background(None, None, bg)
        run("-loop", "1", "-t", str(seconds), "-i", str(bg),
            "-vf", f"fps={FPS},format=yuv420p,fade=in:d=0.5,fade=out:st={seconds - 0.5}:d=0.5",
            "-c:v", "libx264", "-crf", "18", str(part))
        parts.append(part)

    still("intro", 3.5)
    for i, (mark, nxt) in enumerate(zip(marks, marks[1:])):
        step, start, end = mark["step"], mark["t"], nxt["t"]
        if step not in STEPS:
            continue
        speed = max(1.0, (end - start) / TRANSFER_SECONDS) if step == "transfer" else 1.0
        length = (end - start) / speed
        bg, part = tmp / f"{i}.png", tmp / f"{i}.mp4"
        background(*STEPS[step], bg)
        fade_in = "" if step == "transfer" else ",fade=in:d=0.4"
        fade_out = "" if step == "update" else f",fade=out:st={length - 0.4:.2f}:d=0.4"
        run("-loop", "1", "-i", str(bg), "-ss", f"{start:.2f}", "-to", f"{end:.2f}", "-i", raw,
            "-filter_complex",
            f"[1:v]setpts=(PTS-STARTPTS)/{speed},fps={FPS},scale={PHONE_W}:{PHONE_H}[p];"
            f"[0:v][p]overlay=x={W - PHONE_W - 260}:y={(H - PHONE_H) // 2}:shortest=1,format=yuv420p{fade_in}{fade_out}",
            "-t", f"{length:.2f}", "-c:v", "libx264", "-crf", "18", str(part))
        parts.append(part)
    still("outro", 4)

    listing = tmp / "parts.txt"
    listing.write_text("".join(f"file '{p}'\n" for p in parts))
    # Silent track: Play/YouTube accept it and players expect one.
    run("-f", "concat", "-safe", "0", "-i", str(listing), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
        "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", out)
print(f"wrote {out}")
