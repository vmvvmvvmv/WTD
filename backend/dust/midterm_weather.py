from datetime import timedelta

from django.utils import timezone


# KMA mid-term forecasts are regional, not station-level. Keep this mapping separate so
# collection commands and API lookups can share the same broad-region fallback logic.
MIDTERM_REGIONS = [
    {
        "key": "seoul_gyeonggi",
        "label": "Seoul/Incheon/Gyeonggi",
        "land_reg_id": "11B00000",
        "temp_reg_id": "11B10101",
        "bounds": {"lat_min": 36.8, "lat_max": 38.4, "lng_min": 126.0, "lng_max": 128.2},
    },
    {
        "key": "gangwon_yeongseo",
        "label": "Gangwon Yeongseo",
        "land_reg_id": "11D10000",
        "temp_reg_id": "11D10301",
        "bounds": {"lat_min": 37.0, "lat_max": 38.5, "lng_min": 127.4, "lng_max": 128.6},
    },
    {
        "key": "gangwon_yeongdong",
        "label": "Gangwon Yeongdong",
        "land_reg_id": "11D20000",
        "temp_reg_id": "11D20501",
        "bounds": {"lat_min": 37.0, "lat_max": 38.5, "lng_min": 128.3, "lng_max": 129.5},
    },
    {
        "key": "chungbuk",
        "label": "Chungbuk",
        "land_reg_id": "11C10000",
        "temp_reg_id": "11C10301",
        "bounds": {"lat_min": 36.0, "lat_max": 37.4, "lng_min": 127.3, "lng_max": 128.6},
    },
    {
        "key": "daejeon_chungnam",
        "label": "Daejeon/Sejong/Chungnam",
        "land_reg_id": "11C20000",
        "temp_reg_id": "11C20401",
        "bounds": {"lat_min": 35.9, "lat_max": 37.2, "lng_min": 126.0, "lng_max": 127.8},
    },
    {
        "key": "jeonbuk",
        "label": "Jeonbuk",
        "land_reg_id": "11F10000",
        "temp_reg_id": "11F10201",
        "bounds": {"lat_min": 35.3, "lat_max": 36.3, "lng_min": 126.0, "lng_max": 128.0},
    },
    {
        "key": "gwangju_jeonnam",
        "label": "Gwangju/Jeonnam",
        "land_reg_id": "11F20000",
        "temp_reg_id": "11F20501",
        "bounds": {"lat_min": 33.8, "lat_max": 35.8, "lng_min": 125.5, "lng_max": 127.8},
    },
    {
        "key": "daegu_gyeongbuk",
        "label": "Daegu/Gyeongbuk",
        "land_reg_id": "11H10000",
        "temp_reg_id": "11H10701",
        "bounds": {"lat_min": 35.4, "lat_max": 37.4, "lng_min": 128.0, "lng_max": 130.0},
    },
    {
        "key": "busan_gyeongnam",
        "label": "Busan/Ulsan/Gyeongnam",
        "land_reg_id": "11H20000",
        "temp_reg_id": "11H20201",
        "bounds": {"lat_min": 34.5, "lat_max": 36.2, "lng_min": 127.7, "lng_max": 129.6},
    },
    {
        "key": "jeju",
        "label": "Jeju",
        "land_reg_id": "11G00000",
        "temp_reg_id": "11G00201",
        "bounds": {"lat_min": 32.8, "lat_max": 34.2, "lng_min": 125.8, "lng_max": 127.4},
    },
]


def current_midterm_announce_candidates(now=None):
    local_now = timezone.localtime(now or timezone.now())
    today = local_now.date()
    candidates = []
    if local_now.hour >= 18:
        candidates.append((today, "1800"))
        candidates.append((today, "0600"))
    elif local_now.hour >= 6:
        candidates.append((today, "0600"))
        candidates.append((today - timedelta(days=1), "1800"))
    else:
        candidates.append((today - timedelta(days=1), "1800"))
        candidates.append((today - timedelta(days=1), "0600"))
    candidates.append((today - timedelta(days=2), "1800"))
    return [f"{day:%Y%m%d}{hour}" for day, hour in candidates]


def midterm_region_from_lat_lng(lat, lng):
    if lat is None or lng is None:
        return MIDTERM_REGIONS[0]
    for region in MIDTERM_REGIONS:
        bounds = region["bounds"]
        if bounds["lat_min"] <= lat <= bounds["lat_max"] and bounds["lng_min"] <= lng <= bounds["lng_max"]:
            return region
    return min(
        MIDTERM_REGIONS,
        key=lambda region: (
            ((region["bounds"]["lat_min"] + region["bounds"]["lat_max"]) / 2 - lat) ** 2
            + ((region["bounds"]["lng_min"] + region["bounds"]["lng_max"]) / 2 - lng) ** 2
        ),
    )
