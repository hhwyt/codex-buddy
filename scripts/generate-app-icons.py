#!/usr/bin/env python3
"""从 build/icon.svg 导出 App 图标。需要 rsvg-convert；macOS 另导出 ICNS。"""

from pathlib import Path
import shutil
import struct
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
PNG_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256, 512, 1024)
ICO_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)


def main():
    renderer = shutil.which("rsvg-convert")
    if renderer is None:
        raise SystemExit("需要 rsvg-convert 才能从 SVG 导出图标")
    png_dir = BUILD / "icons"
    png_dir.mkdir(exist_ok=True)
    for size in PNG_SIZES:
        subprocess.run([
            renderer, "-w", str(size), "-h", str(size),
            "-o", str(png_dir / f"icon-{size}.png"), str(BUILD / "icon.svg"),
        ], check=True)
    shutil.copyfile(png_dir / "icon-1024.png", BUILD / "icon.png")
    shutil.copyfile(BUILD / "icon.svg", ROOT / "ui" / "assets" / "icon.svg")
    shutil.copyfile(BUILD / "icon.png", ROOT / "ui" / "assets" / "icon.png")

    images = [(size, (png_dir / f"icon-{size}.png").read_bytes()) for size in ICO_SIZES]
    offset = 6 + 16 * len(images)
    entries = []
    for size, data in images:
        entries.append(struct.pack("<BBBBHHII", size % 256, size % 256,
                                   0, 0, 1, 32, len(data), offset))
        offset += len(data)
    (BUILD / "icon.ico").write_bytes(
        struct.pack("<HHH", 0, 1, len(images))
        + b"".join(entries) + b"".join(data for _, data in images)
    )

    iconutil = shutil.which("iconutil")
    if iconutil:
        with tempfile.TemporaryDirectory(prefix="codexbuddy-icons-") as temporary:
            iconset = Path(temporary) / "CodexBuddy.iconset"
            iconset.mkdir()
            for size in (16, 32, 128, 256, 512):
                for scale in (1, 2):
                    suffix = "@2x" if scale == 2 else ""
                    shutil.copyfile(
                        png_dir / f"icon-{size * scale}.png",
                        iconset / f"icon_{size}x{size}{suffix}.png",
                    )
            subprocess.run([iconutil, "-c", "icns", str(iconset),
                            "-o", str(BUILD / "icon.icns")], check=True)
    print("App 图标已导出到 build/")


if __name__ == "__main__":
    main()
