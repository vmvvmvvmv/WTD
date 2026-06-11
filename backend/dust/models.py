from django.db import models

class DustMeasurement(models.Model):
    city = models.CharField(max_length=40)
    region = models.CharField(max_length=80)
    station_name = models.CharField(max_length=120)
    measured_date = models.DateField()
    pm10_value = models.FloatField(null=True, blank=True)
    pm25_value = models.FloatField(null=True, blank=True)
    o3_value = models.FloatField(null=True, blank=True)
    no2_value = models.FloatField(null=True, blank=True)
    raw_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dust_measurement'
        unique_together = ('city', 'region', 'station_name', 'measured_date')
        indexes = [
            models.Index(fields=['city', 'region', 'measured_date'], name='dust_measur_city_9c05d6_idx'),
            models.Index(fields=['station_name', 'measured_date'], name='dust_measur_station_3c87e8_idx'),
        ]

    def __str__(self):
        return f'{self.city} {self.region} {self.measured_date}'


class DustChatLog(models.Model):
    session_key = models.CharField(max_length=80, blank=True, default='')
    user_label = models.CharField(max_length=80, blank=True, default='')
    city = models.CharField(max_length=40)
    region = models.CharField(max_length=80)
    intent = models.CharField(max_length=60)
    question_type = models.CharField(max_length=80, blank=True, default='')
    answer_type = models.CharField(max_length=80, blank=True, default='')
    contains_sensitive_hint = models.BooleanField(default=False)
    used_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'dust_chat_log'
        indexes = [
            models.Index(fields=['city', 'region', 'created_at'], name='dust_chat_l_city_299ac7_idx'),
            models.Index(fields=['intent', 'created_at'], name='dust_chat_l_intent_5cb76c_idx'),
        ]

    def __str__(self):
        return f'{self.city} {self.region} {self.intent} {self.created_at:%Y-%m-%d}'


class AirQualityStation(models.Model):
    sido = models.CharField(max_length=40)
    name = models.CharField(max_length=120)
    addr = models.CharField(max_length=255, blank=True, default='')
    lat = models.FloatField()
    lng = models.FloatField()
    is_active = models.BooleanField(default=True)
    raw_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'air_quality_station'
        unique_together = ('sido', 'name')
        indexes = [
            models.Index(fields=['sido', 'name'], name='aq_station_sido_idx'),
            models.Index(fields=['is_active', 'sido'], name='aq_station_active_idx'),
        ]

    def __str__(self):
        return f'{self.sido} {self.name}'


class RealtimeDustMeasurement(models.Model):
    station = models.ForeignKey(AirQualityStation, on_delete=models.CASCADE, related_name='realtime_measurements')
    measured_at = models.DateTimeField()
    pm10_value = models.FloatField(null=True, blank=True)
    pm25_value = models.FloatField(null=True, blank=True)
    o3_value = models.FloatField(null=True, blank=True)
    no2_value = models.FloatField(null=True, blank=True)
    aqi_value = models.FloatField(null=True, blank=True)
    raw_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'realtime_dust_measurement'
        unique_together = ('station', 'measured_at')
        indexes = [
            models.Index(fields=['station', '-measured_at'], name='rt_dust_station_time_idx'),
            models.Index(fields=['measured_at'], name='rt_dust_time_idx'),
        ]

    def __str__(self):
        return f'{self.station} {self.measured_at:%Y-%m-%d %H:%M}'


class HourlyDustPrediction(models.Model):
    station = models.ForeignKey(AirQualityStation, on_delete=models.CASCADE, related_name='hourly_predictions')
    city = models.CharField(max_length=40)
    region = models.CharField(max_length=80)
    target_at = models.DateTimeField()
    predicted_at = models.DateTimeField()
    horizon_hours = models.PositiveSmallIntegerField()
    model_name = models.CharField(max_length=80, default='hourly_trend_weather_v1')
    pm10_predicted = models.FloatField()
    pm10_actual = models.FloatField(null=True, blank=True)
    absolute_error = models.FloatField(null=True, blank=True)
    squared_error = models.FloatField(null=True, blank=True)
    weather_factor = models.FloatField(default=0)
    trend = models.FloatField(default=0)
    raw_data = models.JSONField(default=dict, blank=True)
    evaluated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'hourly_dust_prediction'
        unique_together = ('station', 'target_at', 'predicted_at', 'model_name')
        indexes = [
            models.Index(fields=['station', 'target_at'], name='hourly_pred_station_target_idx'),
            models.Index(fields=['city', 'region', 'target_at'], name='hourly_pred_region_target_idx'),
            models.Index(fields=['model_name', 'evaluated_at'], name='hourly_pred_eval_idx'),
        ]

    def __str__(self):
        return f'{self.station} {self.target_at:%Y-%m-%d %H:%M} PM10 {self.pm10_predicted}'


class WeatherHourlyMeasurement(models.Model):
    nx = models.IntegerField()
    ny = models.IntegerField()
    measured_at = models.DateTimeField()
    temperature = models.FloatField(null=True, blank=True)
    humidity = models.FloatField(null=True, blank=True)
    wind_speed = models.FloatField(null=True, blank=True)
    wind_direction = models.FloatField(null=True, blank=True)
    rain_mm = models.FloatField(null=True, blank=True)
    rain_probability = models.FloatField(null=True, blank=True)
    sky = models.CharField(max_length=20, blank=True, default='')
    precipitation_type = models.CharField(max_length=20, blank=True, default='')
    label = models.CharField(max_length=20, blank=True, default='')
    raw_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'weather_hourly_measurement'
        unique_together = ('nx', 'ny', 'measured_at')
        indexes = [
            models.Index(fields=['nx', 'ny', '-measured_at'], name='weather_grid_time_idx'),
            models.Index(fields=['measured_at'], name='weather_time_idx'),
        ]

    def __str__(self):
        return f'{self.nx},{self.ny} {self.measured_at:%Y-%m-%d %H:%M}'


class WeatherMidTermForecast(models.Model):
    region_key = models.CharField(max_length=40)
    region_label = models.CharField(max_length=80, blank=True, default='')
    land_reg_id = models.CharField(max_length=20)
    temp_reg_id = models.CharField(max_length=20)
    announced_at = models.DateTimeField()
    forecast_date = models.DateField()
    min_temperature = models.FloatField(null=True, blank=True)
    max_temperature = models.FloatField(null=True, blank=True)
    weather_am = models.CharField(max_length=40, blank=True, default='')
    weather_pm = models.CharField(max_length=40, blank=True, default='')
    rain_probability_am = models.FloatField(null=True, blank=True)
    rain_probability_pm = models.FloatField(null=True, blank=True)
    raw_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'weather_mid_term_forecast'
        unique_together = ('land_reg_id', 'temp_reg_id', 'announced_at', 'forecast_date')
        indexes = [
            models.Index(fields=['region_key', 'forecast_date'], name='weather_mid_region_date_idx'),
            models.Index(fields=['land_reg_id', 'temp_reg_id', '-announced_at'], name='weather_mid_code_time_idx'),
            models.Index(fields=['forecast_date'], name='weather_mid_date_idx'),
        ]

    def __str__(self):
        return f'{self.region_key} {self.forecast_date}'


class NotificationDevice(models.Model):
    expo_push_token = models.CharField(max_length=255, unique=True)
    city = models.CharField(max_length=40)
    region = models.CharField(max_length=80)
    enabled = models.BooleanField(default=True)
    notify_bad_only = models.BooleanField(default=True)
    pm10_threshold = models.FloatField(default=80)
    morning_summary = models.BooleanField(default=False)
    weather_morning_alerts = models.BooleanField(default=False)
    include_favorites = models.BooleanField(default=True)
    regions = models.JSONField(default=list, blank=True)
    calendar_events = models.JSONField(default=list, blank=True)
    last_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'notification_device'
        indexes = [
            models.Index(fields=['enabled', 'city', 'region'], name='noti_device_region_idx'),
            models.Index(fields=['updated_at'], name='noti_device_updated_idx'),
        ]

    def __str__(self):
        return f'{self.city} {self.region} {self.enabled}'


class DustNotificationLog(models.Model):
    device = models.ForeignKey(NotificationDevice, on_delete=models.CASCADE, related_name='notification_logs')
    notification_type = models.CharField(max_length=40)
    city = models.CharField(max_length=40)
    region = models.CharField(max_length=80)
    basis_key = models.CharField(max_length=80)
    pm10_value = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'dust_notification_log'
        unique_together = ('device', 'notification_type', 'city', 'region', 'basis_key')
        indexes = [
            models.Index(fields=['notification_type', 'created_at'], name='noti_log_type_time_idx'),
            models.Index(fields=['city', 'region', 'created_at'], name='noti_log_region_time_idx'),
        ]

    def __str__(self):
        return f'{self.notification_type} {self.city} {self.region} {self.basis_key}'
