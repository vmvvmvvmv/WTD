"""실제 앱 캡처에 빨간 네모와 번호를 얹어 설명 그림을 만든다.

사용: python scripts/annotate.py shots images   (docs/portfolio 폴더에서)
글꼴은 Windows의 Noto Sans KR을 쓴다.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

F = "C:/Windows/Fonts/"
RED = "#E5484D"; INK = "#1F2328"; MUTED = "#6B7280"


def font(size, weight="Regular"):
    return ImageFont.truetype(F + f"NotoSansKR-{weight}.ttf", size)


def annotate(src, crop, boxes, notes, footer, out, same_label=False):
    shot = Image.open(src).convert("RGB").crop(crop)
    sw, sh = shot.size
    im = Image.new("RGB", (1400, sh + 80), "white")
    ox, oy = 40, 40
    im.paste(shot, (ox, oy))
    d = ImageDraw.Draw(im)
    d.rectangle((ox - 1, oy - 1, ox + sw, oy + sh), outline="#D0D7DE", width=2)
    for i, (x1, y1, x2, y2) in enumerate(boxes, 1):
        x1 += ox; x2 += ox; y1 += oy - crop[1]; y2 += oy - crop[1]
        d.rectangle((x1, y1, x2, y2), outline=RED, width=5)
        d.ellipse((x2 - 22, y1 - 22, x2 + 22, y1 + 22), fill=RED)
        label = "1" if same_label else str(i)
        f = font(26, "Bold")
        d.text((x2 - d.textlength(label, font=f) / 2, y1 - 19), label, font=f, fill="white")
    tx, ty = ox + sw + 70, oy + 20
    for i, (head, body) in enumerate(notes, 1):
        d.ellipse((tx, ty + 4, tx + 40, ty + 44), fill=RED)
        f = font(24, "Bold")
        d.text((tx + 20 - d.textlength(str(i), font=f) / 2, ty + 6), str(i), font=f, fill="white")
        d.text((tx + 58, ty), head, font=font(32, "Bold"), fill=INK)
        y = ty + 50
        for line in body:
            d.text((tx + 58, y), line, font=font(26), fill=MUTED)
            y += 40
        ty = y + 36
    for k, line in enumerate(footer if isinstance(footer, list) else [footer]):
        d.text((tx, ty + 10 + k * 40), line, font=font(26, "Medium"), fill=RED)
    im.save(out)


if __name__ == "__main__":
    shots, out = sys.argv[1], sys.argv[2]
    annotate(os.path.join(shots, "home_outfit_male_s.png"), (0, 940, 720, 1440),
             [(20, 1040, 700, 1360), (20, 1372, 700, 1432)],
             [("옷차림 그림·준비물", ["내가 짠 규칙으로 정함", "0.018초 만에 바로 뜸"]),
              ("아래 설명 문장", ["AI(Gemini)가 쓴 문장", "약 1.5초 뒤에 이 줄만 바뀜"])],
             "AI가 늦거나 안 돼도 1번은 그대로 남음", os.path.join(out, "anno_outfit.png"))
    annotate(os.path.join(shots, "home_main_s.png"), (0, 90, 720, 800),
             [(6, 236, 714, 785)],
             [("홈 첫 화면", ["미세먼지 지금 값 · 시간별 · 예측 · 최근 7일", "4가지를 서버에 물어봐야 그려짐"])],
             ["하나씩 물으면 1.57초 → 한 번에 물어서 1.24초", "하나가 안 와도 나머지는 그대로 보임"],
             os.path.join(out, "anno_home.png"))
    annotate(os.path.join(shots, "map_full_s.png"), (0, 180, 720, 1100),
             [(472, 300, 552, 410), (0, 445, 80, 545), (48, 826, 136, 940), (440, 958, 532, 1072)],
             [("값이 없는 측정소 4곳", ["숫자 없이 회색으로 그림", "(지금 기온 모드라 기온 값이 없는 곳)"])],
             ["초록 원 = 값이 있는 측정소 (숫자 = 기온)", "회색 = 정보 없음. 좋음으로 오해하지 않게"],
             os.path.join(out, "anno_map.png"), same_label=True)
    print("ok")
