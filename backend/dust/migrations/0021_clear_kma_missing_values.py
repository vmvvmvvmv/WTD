from django.db import migrations
from django.db.models import Q


# 기상청은 측정을 못 하면 -999·-998.9 같은 값을 보낸다. 예전엔 그대로 저장돼 앱에 -999°가 보일 수 있었다. 값 없음으로 바꾼다.
WEATHER_FIELDS = ("temperature", "humidity", "wind_speed", "wind_direction", "rain_mm", "rain_probability")
MIDTERM_FIELDS = ("min_temperature", "max_temperature", "rain_probability_am", "rain_probability_pm")


def clear_missing_values(apps, schema_editor):
    for model_name, fields in (("WeatherHourlyMeasurement", WEATHER_FIELDS), ("WeatherMidTermForecast", MIDTERM_FIELDS)):
        model = apps.get_model("dust", model_name)
        for field in fields:
            model.objects.filter(Q(**{f"{field}__lte": -900}) | Q(**{f"{field}__gte": 900})).update(**{field: None})


class Migration(migrations.Migration):

    dependencies = [
        ("dust", "0020_drop_duplicate_indexes"),
    ]

    operations = [
        migrations.RunPython(clear_missing_values, migrations.RunPython.noop),
    ]
