from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('dust', '0002_dustchatlog'),
    ]

    operations = [
        migrations.CreateModel(
            name='AirQualityStation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sido', models.CharField(max_length=40)),
                ('name', models.CharField(max_length=120)),
                ('addr', models.CharField(blank=True, default='', max_length=255)),
                ('lat', models.FloatField()),
                ('lng', models.FloatField()),
                ('is_active', models.BooleanField(default=True)),
                ('raw_data', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'air_quality_station',
                'unique_together': {('sido', 'name')},
            },
        ),
        migrations.CreateModel(
            name='RealtimeDustMeasurement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('measured_at', models.DateTimeField()),
                ('pm10_value', models.FloatField(blank=True, null=True)),
                ('pm25_value', models.FloatField(blank=True, null=True)),
                ('o3_value', models.FloatField(blank=True, null=True)),
                ('no2_value', models.FloatField(blank=True, null=True)),
                ('aqi_value', models.FloatField(blank=True, null=True)),
                ('raw_data', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('station', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='realtime_measurements', to='dust.airqualitystation')),
            ],
            options={
                'db_table': 'realtime_dust_measurement',
                'unique_together': {('station', 'measured_at')},
            },
        ),
        migrations.AddIndex(
            model_name='airqualitystation',
            index=models.Index(fields=['sido', 'name'], name='aq_station_sido_idx'),
        ),
        migrations.AddIndex(
            model_name='airqualitystation',
            index=models.Index(fields=['is_active', 'sido'], name='aq_station_active_idx'),
        ),
        migrations.AddIndex(
            model_name='realtimedustmeasurement',
            index=models.Index(fields=['station', '-measured_at'], name='rt_dust_station_time_idx'),
        ),
        migrations.AddIndex(
            model_name='realtimedustmeasurement',
            index=models.Index(fields=['measured_at'], name='rt_dust_time_idx'),
        ),
    ]
