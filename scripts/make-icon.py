#!/usr/bin/env python3
"""로고 이미지를 macOS 앱 아이콘(둥근 모서리 + 여백) 마스터 PNG로 변환한다.

Apple Big Sur+ 아이콘 그리드를 따른다:
  - 캔버스 1024x1024 (투명 배경)
  - 본체 824x824 (사방 100px 여백)
  - 둥근 모서리 반경 ≈ 본체의 22.37%

사용법:  python3 scripts/make-icon.py "image/logo image.png" build/icon.png
"""
import sys
from PIL import Image, ImageChops, ImageDraw

CANVAS = 1024
BODY = 824               # 본체 크기 (사방 100px 여백)
MARGIN = (CANVAS - BODY) // 2
RADIUS = round(BODY * 0.2237)  # macOS squircle 근사 반경
SS = 4                   # 슈퍼샘플링 배율 (가장자리 안티앨리어싱)


def make_icon(src_path: str, out_path: str) -> None:
    logo = Image.open(src_path).convert("RGBA")

    # 본체 크기로 리샘플 (정사각형 가정; 로고가 풀블리드 정사각형)
    body = logo.resize((BODY, BODY), Image.LANCZOS)

    # 둥근 모서리 마스크를 슈퍼샘플링으로 부드럽게 생성
    big = BODY * SS
    mask_big = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask_big).rounded_rectangle(
        [0, 0, big - 1, big - 1], radius=RADIUS * SS, fill=255
    )
    mask = mask_big.resize((BODY, BODY), Image.LANCZOS)

    # 기존 알파와 마스크를 곱해 모서리를 깎는다 (원본 투명도 보존)
    body.putalpha(ImageChops.multiply(body.split()[3], mask))

    # 투명 캔버스 중앙에 배치
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(body, (MARGIN, MARGIN), body)
    canvas.save(out_path)
    print(f"saved {out_path}  ({CANVAS}x{CANVAS}, body {BODY}, radius {RADIUS})")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    make_icon(sys.argv[1], sys.argv[2])
