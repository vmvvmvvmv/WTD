from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='info',
            name='profile_icon',
            field=models.CharField(blank=True, db_column='PROFILE_ICON', default='person', max_length=32, null=True),
        ),
    ]
