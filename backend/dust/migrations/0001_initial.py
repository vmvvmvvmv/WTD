from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='DustMeasurement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('city', models.CharField(max_length=40)),
                ('region', models.CharField(max_length=80)),
                ('station_name', models.CharField(max_length=120)),
                ('measured_date', models.DateField()),
                ('pm10_value', models.FloatField(blank=True, null=True)),
                ('pm25_value', models.FloatField(blank=True, null=True)),
                ('o3_value', models.FloatField(blank=True, null=True)),
                ('no2_value', models.FloatField(blank=True, null=True)),
                ('raw_data', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'dust_measurement',
                'unique_together': {('city', 'region', 'station_name', 'measured_date')},
                'indexes': [
                    models.Index(fields=['city', 'region', 'measured_date'], name='dust_measur_city_9c05d6_idx'),
                    models.Index(fields=['station_name', 'measured_date'], name='dust_measur_station_3c87e8_idx'),
                ],
            },
        ),
    ]
