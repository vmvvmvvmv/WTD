from django.db import migrations


def strip_titles(apps, schema_editor):
    """이미 저장된 알림 기기의 일정 요약에서 제목을 지운다(날짜·시간만 남김)."""
    NotificationDevice = apps.get_model('dust', 'NotificationDevice')
    for device in NotificationDevice.objects.all().iterator():
        events = device.calendar_events if isinstance(device.calendar_events, list) else []
        cleaned = [
            {key: value for key, value in event.items() if key in ('date', 'time')}
            for event in events
            if isinstance(event, dict) and event.get('date')
        ]
        if cleaned != events:
            device.calendar_events = cleaned
            device.save(update_fields=['calendar_events'])


class Migration(migrations.Migration):

    dependencies = [
        ('dust', '0012_outfitrecommendationcache'),
    ]

    operations = [
        migrations.RunPython(strip_titles, migrations.RunPython.noop),
    ]
