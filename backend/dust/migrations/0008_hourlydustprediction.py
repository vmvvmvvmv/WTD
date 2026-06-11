from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('dust', '0007_weatherhourlymeasurement_weather_factors'),
    ]

    operations = [
        migrations.CreateModel(
            name='HourlyDustPrediction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('city', models.CharField(max_length=40)),
                ('region', models.CharField(max_length=80)),
                ('target_at', models.DateTimeField()),
                ('predicted_at', models.DateTimeField()),
                ('horizon_hours', models.PositiveSmallIntegerField()),
                ('model_name', models.CharField(default='hourly_trend_weather_v1', max_length=80)),
                ('pm10_predicted', models.FloatField()),
                ('pm10_actual', models.FloatField(blank=True, null=True)),
                ('absolute_error', models.FloatField(blank=True, null=True)),
                ('squared_error', models.FloatField(blank=True, null=True)),
                ('weather_factor', models.FloatField(default=0)),
                ('trend', models.FloatField(default=0)),
                ('raw_data', models.JSONField(blank=True, default=dict)),
                ('evaluated_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('station', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='hourly_predictions', to='dust.airqualitystation')),
            ],
            options={
                'db_table': 'hourly_dust_prediction',
                'indexes': [
                    models.Index(fields=['station', 'target_at'], name='hourly_pred_station_target_idx'),
                    models.Index(fields=['city', 'region', 'target_at'], name='hourly_pred_region_target_idx'),
                    models.Index(fields=['model_name', 'evaluated_at'], name='hourly_pred_eval_idx'),
                ],
                'unique_together': {('station', 'target_at', 'predicted_at', 'model_name')},
            },
        ),
    ]
