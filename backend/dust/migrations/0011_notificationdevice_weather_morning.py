from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dust', '0010_weathermidtermforecast'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationdevice',
            name='weather_morning_alerts',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='notificationdevice',
            name='calendar_events',
            field=models.JSONField(blank=True, default=list),
        ),
    ]

