import { Ionicons } from '@expo/vector-icons';

import type { CalendarEvent } from '../../types/dust';
import { isDateInEventRange } from './calendarUtils';
import type { CalendarRiskResult } from './calendarRiskEvaluator';

export type CalendarWeatherRiskIndicator = {
  icon: keyof typeof Ionicons.glyphMap;
  key: 'thunder' | 'snowCold' | 'heat' | 'rain' | 'wind' | 'caution';
  label: string;
  priority: number;
  tone: string;
};

function hasThunder(risk?: CalendarRiskResult) {
  const label = risk?.weatherLabel ?? '';
  const lowerLabel = label.toLowerCase();
  return label.includes('\uCC9C\uB465')
    || label.includes('\uBC88\uAC1C')
    || label.includes('\uB099\uB8B0')
    || label.includes('\uB1CC\uC6B0')
    || lowerLabel.includes('thunder')
    || lowerLabel.includes('lightning')
    || lowerLabel.includes('storm');
}

function hasRain(risk?: CalendarRiskResult) {
  const label = risk?.weatherLabel ?? '';
  return !!risk?.rainTimeRange
    || label.includes('\uBE44')
    || (typeof risk?.rainProbability === 'number' && risk.rainProbability >= 60)
    || (typeof risk?.rainMm === 'number' && risk.rainMm > 0);
}

function hasSnowOrCold(risk?: CalendarRiskResult) {
  const label = risk?.weatherLabel ?? '';
  return label.includes('\uB208')
    || label.toLowerCase().includes('snow')
    || (typeof risk?.temperature === 'number' && risk.temperature <= 0);
}

function hasWind(risk?: CalendarRiskResult) {
  return typeof risk?.windSpeed === 'number' && risk.windSpeed >= 8;
}

function hasHeat(risk?: CalendarRiskResult) {
  return typeof risk?.temperature === 'number' && risk.temperature >= 30;
}

export function weatherRiskIndicators(risk?: CalendarRiskResult): CalendarWeatherRiskIndicator[] {
  const indicators: CalendarWeatherRiskIndicator[] = [];
  if (hasSnowOrCold(risk)) {
    indicators.push({
      icon: 'snow-outline',
      key: 'snowCold',
      label: '\uB208\u00B7\uC800\uC628 \uC8FC\uC758',
      priority: 40,
      tone: '#d94b4b',
    });
  }
  if (hasHeat(risk)) {
    indicators.push({
      icon: 'sunny-outline',
      key: 'heat',
      label: typeof risk?.temperature === 'number' ? `\uACE0\uC628 \uC8FC\uC758 ${Math.round(risk.temperature)}\u00B0C` : '\uACE0\uC628 \uC8FC\uC758',
      priority: 35,
      tone: risk?.temperature && risk.temperature >= 33 ? '#d94b4b' : '#c58a19',
    });
  }
  if (hasRain(risk)) {
    indicators.push({
      icon: 'rainy-outline',
      key: 'rain',
      label: risk?.rainTimeRange ? `${risk.rainTimeRange} \uBE44 \uC608\uC0C1` : '\uBE44 \uC608\uC0C1',
      priority: 30,
      tone: '#2f80ed',
    });
  }
  if (hasWind(risk)) {
    indicators.push({
      icon: 'leaf-outline',
      key: 'wind',
      label: '\uAC15\uD48D \uC8FC\uC758',
      priority: 20,
      tone: '#c58a19',
    });
  }
  if (indicators.length === 0 && (risk?.level === 'bad' || risk?.level === 'adjust')) {
    indicators.push({
      icon: 'alert-circle-outline',
      key: 'caution',
      label: risk.badge,
      priority: 10,
      tone: risk.tone,
    });
  }
  return indicators.sort((a, b) => b.priority - a.priority);
}

export function topWeatherRiskForDate(date: string, events: CalendarEvent[], riskByEvent: Record<string, CalendarRiskResult>) {
  return events
    .filter((event) => isDateInEventRange(date, event))
    .flatMap((event) => weatherRiskIndicators(riskByEvent[event.id]))
    .sort((a, b) => b.priority - a.priority)[0];
}
