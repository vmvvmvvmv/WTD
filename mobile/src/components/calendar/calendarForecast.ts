import type { CalendarEvent, HourlyDustItem, PredictionResponse, WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/dust';
import { toNumber } from '../../utils/dust';
import { calendarEventLocationKey } from './calendarLocation';
import { evaluateCalendarEventRisk, type CalendarRiskResult } from './calendarRiskEvaluator';

export type CalendarLocationForecast = {
  currentPm10?: number;
  dustItems?: HourlyDustItem[];
  prediction?: PredictionResponse | null;
  weather?: WeatherState | null;
  weatherHourlyItems?: WeatherHourlyItem[];
  weatherMidTermItems?: WeatherMidTermItem[];
};

export type CalendarForecastContext = {
  currentPm10?: number;
  eventLocationForecasts?: Record<string, CalendarLocationForecast>;
  hourlyItems?: HourlyDustItem[];
  prediction?: PredictionResponse | null;
  todayDateLabel: string;
  weather?: WeatherState | null;
  weatherHourlyItems?: WeatherHourlyItem[];
  weatherMidTermItems?: WeatherMidTermItem[];
};

export type SelectedCalendarForecast = {
  pm10?: number;
  temperature?: number;
  weatherLabel?: string;
};

type DustPoint = {
  date: string;
  label: string;
  value: number;
};

type WeatherPoint = {
  date: string;
  label: string;
  temperature: number | undefined;
  weatherLabel: string | undefined;
};

function itemDate(item: { date?: string; measuredAt?: string }) {
  return item.date ?? (item.measuredAt ? item.measuredAt.slice(0, 10) : '');
}

function itemHour(item: { hour?: string; measuredAt?: string }) {
  return item.hour ?? (item.measuredAt ? item.measuredAt.slice(11, 16) : '');
}

// Calendar cards should prefer precise hourly data. Daily predictions and mid-term weather are fallback sources.
export function buildSelectedCalendarForecast(selectedDate: string, context: CalendarForecastContext): SelectedCalendarForecast {
  const dustForecastItems: DustPoint[] = (context.hourlyItems ?? [])
    .map((item) => ({
      date: itemDate(item),
      label: itemHour(item),
      value: toNumber(item.pm10Value),
    }))
    .filter((item): item is DustPoint => !!item.date && !!item.label && typeof item.value === 'number');

  const weatherForecastItems: WeatherPoint[] = (context.weatherHourlyItems ?? [])
    .map((item) => ({
      date: itemDate(item),
      label: itemHour(item),
      temperature: toNumber(item.temperature),
      weatherLabel: item.label,
    }))
    .filter((item): item is WeatherPoint => !!item.date && !!item.label);

  const hourlyDust = dustForecastItems.find((item) => item.date === selectedDate);
  const hourlyWeather = weatherForecastItems.find((item) => item.date === selectedDate);
  const midTermWeather = context.weatherMidTermItems?.find((item) => item.date === selectedDate);
  const predictionIndex = context.prediction?.future_dates?.findIndex((date) => date === selectedDate) ?? -1;
  const predictedPm10 = predictionIndex >= 0 ? toNumber(context.prediction?.predictions?.[predictionIndex]) : undefined;
  const midTermTemperature = toNumber(midTermWeather?.maxTemperature) ?? toNumber(midTermWeather?.minTemperature);

  return {
    pm10: hourlyDust?.value ?? (selectedDate === context.todayDateLabel ? context.currentPm10 : undefined) ?? predictedPm10,
    temperature: hourlyWeather?.temperature ?? (selectedDate === context.todayDateLabel ? context.weather?.temperature : undefined) ?? midTermTemperature,
    weatherLabel: hourlyWeather?.weatherLabel ?? (selectedDate === context.todayDateLabel ? context.weather?.label : undefined) ?? midTermWeather?.weatherPm ?? midTermWeather?.weatherAm,
  };
}

// Keep all calendar and home guide risk decisions on one shared evaluator path.
export function buildCalendarRiskByEvent(events: CalendarEvent[], context: CalendarForecastContext): Record<string, CalendarRiskResult> {
  return Object.fromEntries(events.map((event) => [
    event.id,
    (() => {
      const locationForecast = context.eventLocationForecasts?.[calendarEventLocationKey(event)];
      const selectedLocationName = [event.locationCity, event.locationRegion].filter(Boolean).join(' ') || event.location || '\uC120\uD0DD\uD55C \uC9C0\uC5ED';
      const locationBasis = locationForecast
        ? `선택 장소 : ${selectedLocationName} 기준`
        : event.location
          ? '현재 지역 기준'
          : undefined;
      return evaluateCalendarEventRisk(event, {
        currentPm10: locationForecast?.currentPm10 ?? context.currentPm10,
        dustItems: locationForecast?.dustItems ?? context.hourlyItems,
        locationBasis,
        prediction: locationForecast?.prediction ?? context.prediction,
        todayDateLabel: context.todayDateLabel,
        weather: locationForecast?.weather ?? context.weather,
        weatherItems: locationForecast?.weatherHourlyItems ?? context.weatherHourlyItems,
        weatherMidTermItems: locationForecast?.weatherMidTermItems ?? context.weatherMidTermItems,
      });
    })(),
  ]));
}
