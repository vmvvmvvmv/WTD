from colorama import Fore, Style

COLOR_MAP = {
    "red": Fore.RED,
    "green": Fore.GREEN,
    "blue": Fore.BLUE,
    "yellow": Fore.YELLOW,
    "cyan": Fore.CYAN,
    "magenta": Fore.MAGENTA,
    "white": Fore.WHITE,
    "black": Fore.BLACK,
}

def color(msg):
    # 색상 태그와 colorama 색상 매핑
    result = ""
    while "[" in msg and "]" in msg:
        start_tag = msg.find("[")
        end_tag = msg.find("]")
        if start_tag != -1 and end_tag != -1 and end_tag > start_tag:
            # 태그와 텍스트 추출
            tag_content = msg[start_tag + 1:end_tag]
            close_tag = f"[/{tag_content}]"

            # 닫는 태그 위치 확인
            close_tag_index = msg.find(close_tag)
            if close_tag_index != -1:
                # 태그 내부 텍스트와 색상
                colored_text = msg[end_tag + 1:close_tag_index]
                color_code = COLOR_MAP.get(tag_content.lower(), "")

                # 결과 문자열에 추가
                result += msg[:start_tag]  # 태그 이전 텍스트
                result += color_code + colored_text + Style.RESET_ALL

                # 처리한 부분 제거
                msg = msg[close_tag_index + len(close_tag):]
            else:
                # 닫는 태그가 없으면 그대로 출력
                result += msg
                break
        else:
            break

    # 나머지 텍스트 추가
    result += msg
    return result