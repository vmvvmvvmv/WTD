"""Normalize region labels and select the current dust response."""


SIDO_ALIASES = {
    '서울': ('서울', '서울특별시'),
    '부산': ('부산', '부산광역시'),
    '대구': ('대구', '대구광역시'),
    '인천': ('인천', '인천광역시'),
    '광주': ('광주', '광주광역시'),
    '대전': ('대전', '대전광역시'),
    '울산': ('울산', '울산광역시'),
    '세종': ('세종', '세종특별자치시'),
    '경기': ('경기', '경기도'),
    '강원': ('강원', '강원도', '강원특별자치도'),
    '충북': ('충북', '충청북도'),
    '충남': ('충남', '충청남도'),
    '전북': ('전북', '전라북도', '전북특별자치도'),
    '전남': ('전남', '전라남도'),
    '경북': ('경북', '경상북도'),
    '경남': ('경남', '경상남도'),
    '제주': ('제주', '제주도', '제주특별자치도'),
}


def canonical_sido_name(value):
    compact = (value or '').strip().replace(' ', '')
    for canonical, aliases in SIDO_ALIASES.items():
        if compact in {alias.replace(' ', '') for alias in aliases}:
            return canonical
    return (value or '').strip()


def has_usable_realtime_values(item):
    return any(item.get(key) not in (None, '', '-') for key in ('pm10', 'pm25', 'o3', 'no2'))


def first_measurement(*values):
    return next((value for value in values if value not in (None, '', '-')), None)


def station_realtime_to_current_item(item, city, region, station_name, source):
    return {
        'cityName': region,
        'dataTime': item.get('time') or item.get('dataTime') or '',
        'pm10Time': item.get('pm10_time') or item.get('pm10Time'),
        'pm25Time': item.get('pm25_time') or item.get('pm25Time'),
        'o3Time': item.get('o3_time') or item.get('o3Time'),
        'no2Time': item.get('no2_time') or item.get('no2Time'),
        'pm10Value': first_measurement(item.get('pm10'), item.get('pm10Value')),
        'pm25Value': first_measurement(item.get('pm25'), item.get('pm25Value')),
        'o3Value': first_measurement(item.get('o3'), item.get('o3Value')),
        'no2Value': first_measurement(item.get('no2'), item.get('no2Value')),
        'stationName': item.get('name') or item.get('stationName') or station_name,
        'city': city,
        'region': region,
        'source': source,
    }


def select_current_dust(city, region, station_name, realtime_item, daily_item):
    if realtime_item and has_usable_realtime_values(realtime_item):
        return {
            'item': station_realtime_to_current_item(realtime_item, city, region, station_name, 'realtime_current'),
            'basis': 'realtime_current',
        }, 200

    if daily_item and has_usable_realtime_values(daily_item):
        return {
            'item': station_realtime_to_current_item(daily_item, city, region, station_name, 'stored_daily_latest'),
            'basis': 'past_latest',
            'notice': '저장된 최신 일평균 값을 표시합니다.',
        }, 200

    return {
        'item': None,
        'basis': 'none',
        'error': 'No stored current or recent dust values.',
    }, 404
