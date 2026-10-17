"""여러 서비스가 같이 쓰는 숫자·날짜 변환, 거리, 기상청 격자 계산."""
import math
import re
from datetime import datetime


def _first_valid_value(*values):
    for value in values:
        if value not in (None, '', '-'):
            return value
    return None


def _median(values):
    numbers = sorted(value for value in values if value is not None)
    if not numbers:
        return None
    middle = len(numbers) // 2
    if len(numbers) % 2:
        return numbers[middle]
    return (numbers[middle - 1] + numbers[middle]) / 2


def _haversine_km(lat1, lng1, lat2, lng2):
    radius = 6371
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return radius * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def _dfs_grid_from_lat_lng(lat, lng):
    re = 6371.00877
    grid = 5.0
    slat1 = 30.0
    slat2 = 60.0
    olon = 126.0
    olat = 38.0
    xo = 43
    yo = 136

    degrad = math.pi / 180.0
    re_grid = re / grid
    slat1_rad = slat1 * degrad
    slat2_rad = slat2 * degrad
    olon_rad = olon * degrad
    olat_rad = olat * degrad

    sn = math.tan(math.pi * 0.25 + slat2_rad * 0.5) / math.tan(math.pi * 0.25 + slat1_rad * 0.5)
    sn = math.log(math.cos(slat1_rad) / math.cos(slat2_rad)) / math.log(sn)
    sf = math.tan(math.pi * 0.25 + slat1_rad * 0.5)
    sf = (sf ** sn) * math.cos(slat1_rad) / sn
    ro = math.tan(math.pi * 0.25 + olat_rad * 0.5)
    ro = re_grid * sf / (ro ** sn)

    ra = math.tan(math.pi * 0.25 + lat * degrad * 0.5)
    ra = re_grid * sf / (ra ** sn)
    theta = lng * degrad - olon_rad
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= sn

    return {
        "nx": int(ra * math.sin(theta) + xo + 0.5),
        "ny": int(ro - ra * math.cos(theta) + yo + 0.5),
    }


def _to_float(value):
    try:
        if value in (None, '', '-'):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_measure_date(value):
    if not value:
        return None
    date_text = str(value).split()[0]
    try:
        return datetime.strptime(date_text, '%Y%m%d').date()
    except ValueError:
        try:
            return datetime.strptime(date_text, '%Y-%m-%d').date()
        except ValueError:
            return None
