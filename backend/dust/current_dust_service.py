"""Select the current dust response from stored realtime and daily measurements."""


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
