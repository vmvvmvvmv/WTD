from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0002_info_profile_icon'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='info',
            name='profile_icon',
        ),
        migrations.AddField(
            model_name='info',
            name='profile_image',
            field=models.ImageField(blank=True, db_column='PROFILE_IMAGE', null=True, upload_to='profiles/'),
        ),
    ]
