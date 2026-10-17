"""Prophet·기준선 앙상블 미세먼지 예측(챗봇 등 선택 기능용)."""
import math
import pandas as pd
from datetime import datetime, timedelta
from django.core.cache import cache
from dust.config import KMA_API_KEY
from dust.models import DustMeasurement
from dust.services.dust_history import _fetch_past_dust_items_by_station, _load_stored_realtime_daily_dust, _store_past_dust_items
from dust.services.stations import _nearest_station_locations, _resolve_station_name
from dust.services.weather import _fetch_kma_weather_by_station, _summarize_kma_weather


def _rows_from_past_items(items, source):
    return [{
        "ds": item.get("msurDt"),
        "y": item.get("pm10Value"),
        "source": source,
    } for item in items]


def _normalize_prediction_frame(rows):
    df = pd.DataFrame(rows)
    if df.empty:
        return df

    df['ds'] = pd.to_datetime(df['ds'], errors='coerce')
    df['y'] = pd.to_numeric(df['y'], errors='coerce')
    df.dropna(inplace=True)
    if df.empty:
        return df

    df['ds'] = df['ds'].dt.normalize()
    df = df.sort_values(['ds', 'source'])
    df = df.drop_duplicates(subset=['ds'], keep='last')
    df = df.sort_values('ds')
    if len(df) >= 20:
        lower = max(1, df['y'].quantile(0.02))
        upper = max(lower, min(300, df['y'].quantile(0.98)))
        df['y'] = df['y'].clip(lower=lower, upper=upper)
    return df


def _blend_with_recent_trend(df, prophet_predictions):
    recent_3 = df.tail(3)['y'].mean()
    recent_7 = df.tail(7)['y'].mean()
    previous_3 = df.tail(6).head(3)['y'].mean() if len(df) >= 6 else recent_7
    short_trend = 0 if pd.isna(previous_3) else (recent_3 - previous_3) * 0.45
    trend_base = recent_3 if not pd.isna(recent_3) else recent_7
    trend_estimates = [
        trend_base + short_trend,
        trend_base + (short_trend * 0.65),
        trend_base + (short_trend * 0.35),
    ]
    blend_weights = [0.72, 0.82, 0.9]
    dynamic_floor = max(1, df['y'].quantile(0.02) * 0.7)
    dynamic_ceiling = max(
        dynamic_floor,
        min(300, max(df['y'].quantile(0.98) * 1.25, df.tail(14)['y'].max() * 1.15))
    )

    predictions = []
    for index, prophet_value in enumerate(prophet_predictions):
        trend_value = trend_estimates[index] if index < len(trend_estimates) else trend_base
        weight = blend_weights[index] if index < len(blend_weights) else 0.9
        blended = (prophet_value * weight) + (trend_value * (1 - weight))
        predictions.append(int(round(max(dynamic_floor, min(dynamic_ceiling, blended)))))
    return predictions


def _baseline_pm10_predictions(df, periods=3):
    y = df['y'].astype(float)
    latest = y.iloc[-1]
    recent_3 = y.tail(3).mean()
    recent_7 = y.tail(7).mean()
    recent_14 = y.tail(14).mean()
    previous_3 = y.tail(6).head(3).mean() if len(y) >= 6 else recent_7
    trend = 0 if pd.isna(previous_3) else max(-10, min(10, (recent_3 - previous_3) * 0.35))
    base = (latest * 0.32) + (recent_3 * 0.28) + (recent_7 * 0.25) + (recent_14 * 0.15)

    predictions = []
    for index in range(periods):
        decay = [1.0, 0.55, 0.25][index] if index < 3 else 0.15
        predictions.append(float(max(1, base + (trend * decay))))
    return predictions


def _adaptive_prophet_weights(backtest=None, volatility_ratio=None):
    if backtest and backtest.get("available"):
        prophet_mae = backtest.get("prophet_mae")
        baseline_mae = backtest.get("baseline_mae")
        if prophet_mae and baseline_mae:
            if baseline_mae * 2.5 < prophet_mae:
                return [0.04, 0.08, 0.12]
            if baseline_mae * 1.5 < prophet_mae:
                return [0.12, 0.18, 0.24]
            if prophet_mae * 1.25 < baseline_mae:
                return [0.55, 0.62, 0.68]

    if volatility_ratio is None:
        return [0.42, 0.5, 0.58]
    if volatility_ratio > 1.25:
        return [0.25, 0.32, 0.4]
    if volatility_ratio < 0.75:
        return [0.5, 0.58, 0.65]
    return [0.42, 0.5, 0.58]


def _ensemble_pm10_predictions(df, prophet_predictions, periods=3, backtest=None):
    baseline = _baseline_pm10_predictions(df, periods=periods)
    y = df['y'].astype(float)
    recent_volatility = y.tail(min(14, len(y))).std()
    history_volatility = y.std()
    if pd.isna(recent_volatility):
        recent_volatility = 0
    if pd.isna(history_volatility) or history_volatility == 0:
        history_volatility = max(1, recent_volatility)

    volatility_ratio = recent_volatility / max(1, history_volatility)
    prophet_weights = _adaptive_prophet_weights(backtest=backtest, volatility_ratio=volatility_ratio)

    blended = []
    for index in range(periods):
        prophet_value = prophet_predictions[index] if index < len(prophet_predictions) else baseline[index]
        prophet_weight = prophet_weights[index] if index < len(prophet_weights) else prophet_weights[-1]
        blended.append((prophet_value * prophet_weight) + (baseline[index] * (1 - prophet_weight)))
    return _blend_with_recent_trend(df, blended), prophet_weights, [round(value, 1) for value in baseline]


def _forecast_pm10(df, periods=3, backtest=None):
    from prophet import Prophet  # 무거운 의존성이라 실제 학습할 때만 로드한다.

    model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=True,
        yearly_seasonality=True,
        changepoint_prior_scale=0.3,
        seasonality_prior_scale=15,
        changepoint_range=0.95,
    )
    model.fit(df[['ds', 'y']])
    today_date = datetime.now().date()
    latest_data_date = df['ds'].max().date()
    data_lag_days = max(0, (today_date - latest_data_date).days)
    future = model.make_future_dataframe(periods=data_lag_days + periods, freq='D')
    forecast = model.predict(future)
    today = datetime.now().strftime('%Y-%m-%d')
    future_forecast = forecast[forecast['ds'].dt.strftime('%Y-%m-%d') > today].head(periods)
    future_dates = future_forecast['ds'].dt.strftime('%Y-%m-%d').tolist()
    prophet_predictions = future_forecast['yhat'].tolist()
    predictions, prophet_weights, baseline_predictions = _ensemble_pm10_predictions(
        df,
        prophet_predictions,
        periods=periods,
        backtest=backtest,
    )
    return future_dates, predictions, {
        "prophet_predictions": [round(float(value), 1) for value in prophet_predictions],
        "baseline_predictions": baseline_predictions,
        "prophet_weights": prophet_weights,
    }


def _calculate_backtest_metrics(df):
    if len(df) < 45:
        return {
            "available": False,
            "reason": "백테스트를 계산하려면 최소 45일 이상의 데이터가 필요합니다.",
        }

    holdout_days = min(14, max(7, len(df) // 6))
    train_df = df.iloc[:-holdout_days]
    test_df = df.iloc[-holdout_days:].copy()
    if len(train_df) < 30 or test_df.empty:
        return {
            "available": False,
            "reason": "학습/검증 구간을 나누기에 데이터가 부족합니다.",
        }

    try:
        from prophet import Prophet  # 무거운 의존성이라 실제 학습할 때만 로드한다.

        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=True,
            changepoint_prior_scale=0.3,
            seasonality_prior_scale=15,
            changepoint_range=0.95,
        )
        model.fit(train_df[['ds', 'y']])
        future = model.make_future_dataframe(periods=holdout_days, freq='D')
        forecast = model.predict(future)
        predicted = forecast[['ds', 'yhat']].merge(test_df[['ds', 'y']], on='ds', how='inner')
        if predicted.empty:
            return {"available": False, "reason": "검증 날짜와 예측 날짜가 맞지 않습니다."}

        rolling_history = train_df.copy()
        prophet_values = []
        baseline_values = []
        for _, actual_row in test_df.iterrows():
            prophet_row = predicted[predicted['ds'] == actual_row['ds']]
            prophet_value = float(prophet_row.iloc[0]['yhat']) if not prophet_row.empty else float(rolling_history['y'].tail(7).mean())
            prophet_values.append(prophet_value)
            baseline_value = _baseline_pm10_predictions(rolling_history, periods=1)[0]
            baseline_values.append(baseline_value)
            rolling_history = pd.concat([rolling_history, actual_row.to_frame().T], ignore_index=True)

        predicted = predicted.copy()
        predicted['baseline'] = baseline_values[:len(predicted)]
        predicted['prophet_value'] = prophet_values[:len(predicted)]
        prophet_mae = (predicted['yhat'] - predicted['y']).abs().mean()
        baseline_mae = (predicted['baseline'] - predicted['y']).abs().mean()
        prophet_weights = _adaptive_prophet_weights(backtest={
            "available": True,
            "prophet_mae": prophet_mae,
            "baseline_mae": baseline_mae,
        })
        predicted['ensemble'] = [
            (row['prophet_value'] * prophet_weights[min(index, len(prophet_weights) - 1)])
            + (row['baseline'] * (1 - prophet_weights[min(index, len(prophet_weights) - 1)]))
            for index, (_, row) in enumerate(predicted.iterrows())
        ]
        error = (predicted['ensemble'] - predicted['y']).abs()
        rmse = math.sqrt(((predicted['ensemble'] - predicted['y']) ** 2).mean())
        non_zero = predicted[predicted['y'] != 0]
        mape = None
        if not non_zero.empty:
            mape = ((non_zero['ensemble'] - non_zero['y']).abs() / non_zero['y']).mean() * 100

        return {
            "available": True,
            "holdout_days": len(predicted),
            "mae": round(float(error.mean()), 1),
            "rmse": round(float(rmse), 1),
            "mape": round(float(mape), 1) if mape is not None else None,
            "prophet_mae": round(float(prophet_mae), 1),
            "baseline_mae": round(float(baseline_mae), 1),
            "prophet_weights": prophet_weights,
            "method": "rolling_ensemble_backtest",
        }
    except Exception as exc:
        return {
            "available": False,
            "reason": str(exc)[:120],
        }


def _nearby_station_prediction_adjustment(sido, station_name, start_date, end_date):
    nearby_locations = _nearest_station_locations(sido, station_name, limit=3)
    if not nearby_locations:
        return [], [], None

    forecasts = []
    used_stations = []
    first_error = None
    for location in nearby_locations:
        items, error = _fetch_past_dust_items_by_station(location["name"], start_date, end_date)
        if error and not first_error:
            first_error = error
        nearby_df = _normalize_prediction_frame(_rows_from_past_items(items, "nearby"))
        if len(nearby_df) < 30:
            continue
        try:
            _, nearby_predictions, _ = _forecast_pm10(nearby_df, periods=3)
        except Exception as exc:
            if not first_error:
                first_error = str(exc)
            continue
        if len(nearby_predictions) == 3:
            forecasts.append(nearby_predictions)
            used_stations.append({
                "name": location["name"],
                "sido": location["sido"],
                "distance_km": location["distance_km"],
            })

    if not forecasts:
        return [], nearby_locations, first_error

    averaged = []
    for index in range(3):
        averaged.append(sum(forecast[index] for forecast in forecasts) / len(forecasts))
    return averaged, used_stations, first_error


def _weather_adjust_predictions(predictions, weather_days):
    if not weather_days or len(weather_days) != len(predictions):
        return predictions, []

    adjusted = []
    adjustments = []
    for index, prediction in enumerate(predictions):
        weather = weather_days[index]
        factor = 1.0
        reasons = []

        rain_mm = weather.get("rain_mm") or 0
        rain_probability = weather.get("rain_probability") or 0
        precipitation_type = weather.get("precipitation_type") or 0
        wind_speed = weather.get("wind_speed") or 0
        humidity = weather.get("humidity") or 0

        if rain_mm >= 1 or precipitation_type > 0:
            factor -= 0.12
            reasons.append("강수 예보")
        elif rain_probability >= 60:
            factor -= 0.06
            reasons.append("높은 강수확률")

        if wind_speed >= 5:
            factor -= 0.08
            reasons.append("강한 바람")
        elif wind_speed >= 3:
            factor -= 0.04
            reasons.append("보통 이상 바람")

        if humidity >= 85 and rain_mm < 1:
            factor += 0.04
            reasons.append("높은 습도")

        factor = max(0.78, min(1.08, factor))
        adjusted_value = int(round(max(1, prediction * factor)))
        adjusted.append(adjusted_value)
        adjustments.append({
            "date": weather.get("date"),
            "factor": round(factor, 2),
            "before": prediction,
            "after": adjusted_value,
            "reasons": reasons,
        })

    return adjusted, adjustments


def _build_prediction_for_region(city, district):
    cache_key = f'dust_predict_v10_{city}_{district}'
    cached_data = cache.get(cache_key)
    if cached_data:
        return (cached_data.get(city) or {}).get(district) or {}

    station_name = _resolve_station_name(city, district)
    end_date = datetime.now()
    start_date = end_date - timedelta(days=180)
    stored_start_date = end_date.date() - timedelta(days=730)

    items = []
    api_error = None
    stored_measurements = DustMeasurement.objects.filter(
        city=city,
        region=district,
        station_name=station_name,
        measured_date__gte=stored_start_date,
        pm10_value__isnull=False,
    ).order_by('measured_date')
    realtime_daily_items = _load_stored_realtime_daily_dust(
        city,
        district,
        station_name,
        stored_start_date,
        end_date,
    )

    stored_rows = [{
        "ds": measurement.measured_date,
        "y": measurement.pm10_value,
        "source": "stored",
    } for measurement in stored_measurements]
    realtime_rows = _rows_from_past_items(realtime_daily_items, "realtime_daily")
    api_rows = []

    if len(stored_rows) + len(realtime_rows) < 2:
        items, api_error = _fetch_past_dust_items_by_station(station_name, start_date, end_date, allow_api=True)
        if items:
            _store_past_dust_items(city, district, station_name, items)
        api_rows = _rows_from_past_items(items, "airkorea")

    rows = api_rows + stored_rows + realtime_rows
    if not rows:
        result = {
            "future_dates": [],
            "predictions": [],
            "model": {
                "available": False,
                "station_name": station_name,
                "api_error": api_error,
                "error": f"{district} 지역에서 예측에 사용할 데이터를 찾지 못했습니다.",
            },
        }
    else:
        df = _normalize_prediction_frame(rows)
        if len(df) < 2:
            result = {
                "future_dates": [],
                "predictions": [],
                "model": {
                    "available": False,
                    "station_name": station_name,
                    "training_count": len(df),
                    "api_error": api_error,
                    "error": f"{district} 지역은 아직 예측할 만큼 데이터가 충분하지 않습니다.",
                },
            }
        else:
            backtest = _calculate_backtest_metrics(df)
            future_dates, predictions, ensemble_info = _forecast_pm10(df, periods=3, backtest=backtest)
            nearby_predictions, nearby_stations, nearby_error = _nearby_station_prediction_adjustment(
                city,
                station_name,
                start_date,
                end_date,
            )
            nearby_weights = [0.12, 0.1, 0.08]
            if len(nearby_predictions) == len(predictions):
                predictions = [
                    int(round((prediction * (1 - nearby_weights[index])) + (nearby_predictions[index] * nearby_weights[index])))
                    for index, prediction in enumerate(predictions)
                ]
            weather_items, weather_error = _fetch_kma_weather_by_station(city, station_name)
            weather_days = _summarize_kma_weather(weather_items, periods=3)
            predictions, weather_adjustments = _weather_adjust_predictions(predictions, weather_days)
            result = {
                "future_dates": future_dates,
                "predictions": predictions,
                "model": {
                    "method": "prophet_recent_baseline_nearby_weather_ensemble",
                    "training_count": len(df),
                    "earliest_training_date": df['ds'].min().strftime('%Y-%m-%d'),
                    "latest_training_date": df['ds'].max().strftime('%Y-%m-%d'),
                    "api_count": len(items),
                    "stored_count": len(stored_rows),
                    "realtime_daily_count": len(realtime_rows),
                    "nearby_stations": nearby_stations,
                    "nearby_error": nearby_error,
                    "backtest": backtest,
                    "ensemble": ensemble_info,
                    "weather": {
                        "source": "KMA_VilageFcst",
                        "enabled": bool(KMA_API_KEY),
                        "error": weather_error,
                        "days": weather_days,
                        "adjustments": weather_adjustments,
                    },
                },
            }

    # predict_dust와 같은 키를 쓰므로, 데이터 부족 결과를 저장하면 홈 예측이 1시간 동안 비어 보인다.
    # predict_dust처럼 실제 예측값이 있을 때만 캐시에 남긴다.
    if result["predictions"]:
        cache.set(cache_key, {city: {district: result}}, 60 * 60)
    return result
