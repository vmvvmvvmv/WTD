from PIL import Image, ImageDraw, ImageFont
import sys, os

F = "C:/Windows/Fonts/"
def font(s, w="Regular"):
    return ImageFont.truetype(F + f"NotoSansKR-{w}.ttf", s)

BLUE = "#3D7FEA"; INK = "#1F2328"; MUTED = "#6B7280"; LINE = "#D0D7DE"
shots, out = sys.argv[1], sys.argv[2]

W, H = 1600, 930
im = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(im)
d.text((60, 40), "앱 · 서버 · 바깥 서비스가 하는 일", font=font(44, "Bold"), fill=INK)
d.text((62, 100), "앱은 일정과 판단, 서버는 데이터 정리와 옷차림 규칙, 바깥 서비스는 원본 데이터", font=font(24), fill=MUTED)

# 앱: 실제 화면
PW, PH, top = 270, 585, 190
mask = Image.new("L", (PW, PH), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, PW - 1, PH - 1), radius=26, fill=255)
shot = Image.open(os.path.join(shots, "home_main_s.png")).convert("RGB").resize((PW, PH), Image.LANCZOS)
im.paste(shot, (60, top), mask)
d.rounded_rectangle((59, top - 1, 60 + PW, top + PH), radius=26, outline=LINE, width=2)
d.text((60, top + PH + 18), "앱 (React Native)", font=font(28, "Bold"), fill=INK)

def column(x, title, lines):
    d.text((x, top), title, font=font(32, "Bold"), fill=INK)
    d.line((x, top + 54, x + 380, top + 54), fill=BLUE, width=4)
    y = top + 80
    for head, sub in lines:
        d.text((x, y), "· " + head, font=font(26, "Medium"), fill=INK)
        d.text((x + 22, y + 40), sub, font=font(21), fill=MUTED)
        y += 100

def arrow(x1, x2, y, label):
    d.line((x1, y, x2 - 14, y), fill=BLUE, width=5)
    d.polygon([(x2, y), (x2 - 18, y - 11), (x2 - 18, y + 11)], fill=BLUE)
    tw = d.textlength(label, font=font(20, "Medium"))
    d.text(((x1 + x2) / 2 - tw / 2, y - 36), label, font=font(20, "Medium"), fill=BLUE)

column(500, "서버 (Django · MySQL)", [
    ("날씨 · 미세먼지 정리", "공공 데이터를 앱이 바로 쓰게 바꿈"),
    ("옷차림 규칙", "체감온도로 옷 · 준비물 결정"),
    ("지도 화면", "마커 색 · 범례를 서버에서 정함"),
    ("아침 알림", "오늘 날씨 + 일정 3개까지"),
])
column(1120, "바깥 서비스", [
    ("기상청 · AirKorea", "날씨 · 미세먼지 원본"),
    ("Naver Maps", "지도 · 장소 검색"),
    ("Gemini", "옷차림 설명 문장만"),
    ("Expo Push", "아침 알림 보내기"),
])
arrow(350, 480, top + 160, "요청")
arrow(910, 1100, top + 160, "가져옴")
d.text((60, H - 52), "앱 안에서 하는 일: 일정 저장 · 일정 시간대 위험 판단 · 약속 전 알림 예약", font=font(22, "Medium"), fill=BLUE)
im.save(os.path.join(out, "arch2.png"))
print("ok")
