from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dust', '0006_weatherhourlymeasurement'),
    ]

    operations = [
        migrations.AddField(
            model_name='weatherhourlymeasurement',
            name='humidity',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='weatherhourlymeasurement',
            name='rain_mm',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='weatherhourlymeasurement',
            name='rain_probability',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='weatherhourlymeasurement',
            name='wind_speed',
            field=models.FloatField(blank=True, null=True),
        ),
    ]
