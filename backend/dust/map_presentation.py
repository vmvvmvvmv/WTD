MAP_COLORS = {
    'air_good': '#3D7FEA',
    'air_moderate': '#2F9B69',
    'air_bad': '#E18B2D',
    'air_very_bad': '#E05263',
    'unavailable': '#A8B2C1',
    'weather_cold': '#3D7FEA',
    'weather_cool': '#65A1D8',
    'weather_mild': '#2F9B69',
    'weather_warm': '#E18B2D',
    'weather_hot': '#E05263',
}

DUST_THRESHOLDS = [30, 80, 150]

DUST_LEGEND = [
    {'label': '좋음', 'color': MAP_COLORS['air_good']},
    {'label': '보통', 'color': MAP_COLORS['air_moderate']},
    {'label': '나쁨', 'color': MAP_COLORS['air_bad']},
    {'label': '매우 나쁨', 'color': MAP_COLORS['air_very_bad']},
    {'label': '정보 없음', 'color': MAP_COLORS['unavailable']},
]

WEATHER_LEGEND = [
    {'label': '추움', 'color': MAP_COLORS['weather_cold']},
    {'label': '선선', 'color': MAP_COLORS['weather_cool']},
    {'label': '적정', 'color': MAP_COLORS['weather_mild']},
    {'label': '더움', 'color': MAP_COLORS['weather_warm']},
    {'label': '매우 더움', 'color': MAP_COLORS['weather_hot']},
    {'label': '정보 없음', 'color': MAP_COLORS['unavailable']},
]


def build_map_ui_config():
    return {
        'dust': {'thresholds': DUST_THRESHOLDS, 'legend': DUST_LEGEND},
        'weather': {'legend': WEATHER_LEGEND},
    }


def build_map_css_variables():
    return '; '.join(
        f"--{name.replace('_', '-')}: {value}"
        for name, value in MAP_COLORS.items()
    ) + ';'
