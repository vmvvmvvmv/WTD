from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dust', '0008_hourlydustprediction'),
    ]

    operations = [
        migrations.AddField(
            model_name='weatherhourlymeasurement',
            name='wind_direction',
            field=models.FloatField(blank=True, null=True),
        ),
    ]
