from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('dust', '0003_airqualitystation_realtimedustmeasurement'),
    ]

    operations = [
        migrations.CreateModel(
            name='NotificationDevice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('expo_push_token', models.CharField(max_length=255, unique=True)),
                ('city', models.CharField(max_length=40)),
                ('region', models.CharField(max_length=80)),
                ('enabled', models.BooleanField(default=True)),
                ('notify_bad_only', models.BooleanField(default=True)),
                ('morning_summary', models.BooleanField(default=False)),
                ('include_favorites', models.BooleanField(default=True)),
                ('regions', models.JSONField(blank=True, default=list)),
                ('last_sent_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'notification_device',
            },
        ),
        migrations.CreateModel(
            name='DustNotificationLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('notification_type', models.CharField(max_length=40)),
                ('city', models.CharField(max_length=40)),
                ('region', models.CharField(max_length=80)),
                ('basis_key', models.CharField(max_length=80)),
                ('pm10_value', models.FloatField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('device', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notification_logs', to='dust.notificationdevice')),
            ],
            options={
                'db_table': 'dust_notification_log',
                'unique_together': {('device', 'notification_type', 'city', 'region', 'basis_key')},
            },
        ),
        migrations.AddIndex(
            model_name='notificationdevice',
            index=models.Index(fields=['enabled', 'city', 'region'], name='noti_device_region_idx'),
        ),
        migrations.AddIndex(
            model_name='notificationdevice',
            index=models.Index(fields=['updated_at'], name='noti_device_updated_idx'),
        ),
        migrations.AddIndex(
            model_name='dustnotificationlog',
            index=models.Index(fields=['notification_type', 'created_at'], name='noti_log_type_time_idx'),
        ),
        migrations.AddIndex(
            model_name='dustnotificationlog',
            index=models.Index(fields=['city', 'region', 'created_at'], name='noti_log_region_time_idx'),
        ),
    ]
