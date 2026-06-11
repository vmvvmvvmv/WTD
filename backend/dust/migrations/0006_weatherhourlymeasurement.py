from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dust', '0005_notificationdevice_pm10_threshold'),
    ]

    operations = [
        migrations.CreateModel(
            name='WeatherHourlyMeasurement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nx', models.IntegerField()),
                ('ny', models.IntegerField()),
                ('measured_at', models.DateTimeField()),
                ('temperature', models.FloatField(blank=True, null=True)),
                ('sky', models.CharField(blank=True, default='', max_length=20)),
                ('precipitation_type', models.CharField(blank=True, default='', max_length=20)),
                ('label', models.CharField(blank=True, default='', max_length=20)),
                ('raw_data', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'weather_hourly_measurement',
                'indexes': [
                    models.Index(fields=['nx', 'ny', '-measured_at'], name='weather_grid_time_idx'),
                    models.Index(fields=['measured_at'], name='weather_time_idx'),
                ],
                'unique_together': {('nx', 'ny', 'measured_at')},
            },
        ),
    ]
