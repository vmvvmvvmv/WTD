from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dust', '0009_weatherhourlymeasurement_wind_direction'),
    ]

    operations = [
        migrations.CreateModel(
            name='WeatherMidTermForecast',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('region_key', models.CharField(max_length=40)),
                ('region_label', models.CharField(blank=True, default='', max_length=80)),
                ('land_reg_id', models.CharField(max_length=20)),
                ('temp_reg_id', models.CharField(max_length=20)),
                ('announced_at', models.DateTimeField()),
                ('forecast_date', models.DateField()),
                ('min_temperature', models.FloatField(blank=True, null=True)),
                ('max_temperature', models.FloatField(blank=True, null=True)),
                ('weather_am', models.CharField(blank=True, default='', max_length=40)),
                ('weather_pm', models.CharField(blank=True, default='', max_length=40)),
                ('rain_probability_am', models.FloatField(blank=True, null=True)),
                ('rain_probability_pm', models.FloatField(blank=True, null=True)),
                ('raw_data', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'weather_mid_term_forecast',
                'indexes': [
                    models.Index(fields=['region_key', 'forecast_date'], name='weather_mid_region_date_idx'),
                    models.Index(fields=['land_reg_id', 'temp_reg_id', '-announced_at'], name='weather_mid_code_time_idx'),
                    models.Index(fields=['forecast_date'], name='weather_mid_date_idx'),
                ],
                'unique_together': {('land_reg_id', 'temp_reg_id', 'announced_at', 'forecast_date')},
            },
        ),
    ]
