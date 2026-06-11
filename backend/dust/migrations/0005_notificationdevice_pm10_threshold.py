from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dust', '0004_notificationdevice_dustnotificationlog'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationdevice',
            name='pm10_threshold',
            field=models.FloatField(default=80),
        ),
    ]
