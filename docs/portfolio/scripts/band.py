"""포트폴리오 맨 위 파란 띠 이미지. 사용: python scripts/band.py images"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

F = "C:/Windows/Fonts/"


def font(size, weight="Regular"):
    return ImageFont.truetype(F + f"NotoSansKR-{weight}.ttf", size)


im = Image.new("RGB", (2400, 420), "#3D7FEA")
d = ImageDraw.Draw(im)
d.text((120, 92), "WeatherToDo", font=font(110, "Bold"), fill="white")
d.text((126, 252), "약속 시간·장소의 날씨로 옷차림과 챙길 것을 알려주는 일정 앱", font=font(42), fill="white")
d.text((126, 322), "Android · React Native · Django · 1인 개발", font=font(32), fill="#D6E4FB")
im.save(os.path.join(sys.argv[1], "band.png"))
print("ok")
