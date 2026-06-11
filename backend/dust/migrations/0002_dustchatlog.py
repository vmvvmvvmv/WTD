from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dust', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='DustChatLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('session_key', models.CharField(blank=True, default='', max_length=80)),
                ('user_label', models.CharField(blank=True, default='', max_length=80)),
                ('city', models.CharField(max_length=40)),
                ('region', models.CharField(max_length=80)),
                ('intent', models.CharField(max_length=60)),
                ('question_type', models.CharField(blank=True, default='', max_length=80)),
                ('answer_type', models.CharField(blank=True, default='', max_length=80)),
                ('contains_sensitive_hint', models.BooleanField(default=False)),
                ('used_data', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'dust_chat_log',
            },
        ),
        migrations.AddIndex(
            model_name='dustchatlog',
            index=models.Index(fields=['city', 'region', 'created_at'], name='dust_chat_l_city_299ac7_idx'),
        ),
        migrations.AddIndex(
            model_name='dustchatlog',
            index=models.Index(fields=['intent', 'created_at'], name='dust_chat_l_intent_5cb76c_idx'),
        ),
    ]
