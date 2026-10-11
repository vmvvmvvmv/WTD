from PIL import Image, ImageDraw, ImageFont
import sys, os

F = "C:/Windows/Fonts/"
def font(s, w="Regular"):
    return ImageFont.truetype(F + f"NotoSansKR-{w}.ttf", s)

BLUE = "#3D7FEA"; INK = "#1F2328"; MUTED = "#6B7280"; LINE = "#D0D7DE"

shots, out = sys.argv[1], sys.argv[2]
steps = [
    ("editor_top_s.png", "약속 넣기", "시간 · 장소 · 실내/실외"),
    ("cal_sheet_outfit.png", "그때 날씨 보기", "날짜를 누르면 그날 날씨와 일정"),
    ("home_outfit_male_s.png", "옷차림 추천", "뭘 입고 뭘 챙길지"),
    ("map_sheet_s.png", "주변 날씨 지도", "기온 · 미세먼지를 지도에서"),
]
PW, PH, GAP, M = 300, 650, 96, 60
W = M * 2 + PW * 4 + GAP * 3
H = 150 + PH + 250
im = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(im)
d.text((M, 40), "WeatherToDo 한눈에 보기", font=font(44, "Bold"), fill=INK)
d.text((M + 2, 100), "약속을 넣으면, 그 시간 그 장소의 날씨로 옷차림과 챙길 것을 알려줌", font=font(24), fill=MUTED)

top = 160
mask = Image.new("L", (PW, PH), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, PW - 1, PH - 1), radius=28, fill=255)
for i, (name, head, body) in enumerate(steps):
    x = M + i * (PW + GAP)
    shot = Image.open(os.path.join(shots, name)).convert("RGB").resize((PW, PH), Image.LANCZOS)
    im.paste(shot, (x, top), mask)
    d.rounded_rectangle((x - 1, top - 1, x + PW, top + PH), radius=28, outline=LINE, width=2)
    # 번호와 설명
    cy = top + PH + 30
    d.ellipse((x, cy, x + 44, cy + 44), fill=BLUE)
    f = font(26, "Bold")
    d.text((x + 22 - d.textlength(str(i + 1), font=f) / 2, cy + 3), str(i + 1), font=f, fill="white")
    d.text((x + 58, cy - 2), head, font=font(30, "Bold"), fill=INK)
    d.text((x, cy + 58), body, font=font(22), fill=MUTED)
    if i < 3:
        ax = x + PW + 18; ay = top + PH // 2
        d.line((ax, ay, ax + GAP - 36, ay), fill=BLUE, width=5)
        d.polygon([(ax + GAP - 30, ay), (ax + GAP - 46, ay - 11), (ax + GAP - 46, ay + 11)], fill=BLUE)
d.text((M, H - 60), "+ 약속 전·아침에 날씨 알림   + 미세먼지 나쁨 알림   + 민감군 모드", font=font(22, "Medium"), fill=BLUE)
im.save(os.path.join(out, "overview.png"))
print(W, H)
