from datetime import datetime, timedelta

from django.db import migrations
from django.utils import timezone


VALUE_FIELDS = ('pm10_value', 'pm25_value', 'o3_value', 'no2_value', 'aqi_value')


def fix_midnight_times(apps, schema_editor):
    """에어코리아 '24:00'(자정)을 읽지 못해 수집 시각(1~2시)으로 저장된 행을 다음 날 0시로 옮긴다.

    원본 표기(raw_data.time)가 아직 '24:00'인 행만 고친다. 0시 행이 이미 있으면 그 행의 빈 값만 채우고 잘못 붙은 쪽을 지운다
    (늦게 받은 쪽에 에어코리아가 나중에 채운 값이 있을 수 있다).
    """
    RealtimeDustMeasurement = apps.get_model('dust', 'RealtimeDustMeasurement')
    tz = timezone.get_current_timezone()
    for row in RealtimeDustMeasurement.objects.filter(raw_data__time__endswith='24:00').iterator():
        try:
            day = datetime.strptime(str(row.raw_data.get('time'))[:10], '%Y-%m-%d')
        except ValueError:
            continue
        midnight = timezone.make_aware(day + timedelta(days=1), tz)
        if row.measured_at == midnight:
            continue
        existing = RealtimeDustMeasurement.objects.filter(station_id=row.station_id, measured_at=midnight).first()
        if existing:
            filled = [field for field in VALUE_FIELDS if getattr(existing, field) is None and getattr(row, field) is not None]
            for field in filled:
                setattr(existing, field, getattr(row, field))
            if filled:
                existing.save(update_fields=filled)
            row.delete()
        else:
            row.measured_at = midnight
            row.save(update_fields=['measured_at'])


class Migration(migrations.Migration):

    dependencies = [
        ('dust', '0015_llm_daily_usage'),
    ]

    operations = [
        migrations.RunPython(fix_midnight_times, migrations.RunPython.noop),
    ]
