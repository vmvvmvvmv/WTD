from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('dust', '0011_notificationdevice_weather_morning')]

    operations = [
        migrations.CreateModel(
            name='OutfitRecommendationCache',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('cache_key', models.CharField(max_length=160, unique=True)),
                ('response_json', models.JSONField(default=dict)),
                ('source', models.CharField(default='rule', max_length=12)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('valid_until', models.DateTimeField()),
            ],
            options={
                'db_table': 'outfit_recommendation_cache',
                'indexes': [models.Index(fields=['valid_until'], name='outfit_cache_valid_idx')],
            },
        ),
    ]
