export type SemanticTone = {
  border: string;
  soft: string;
  tone: string;
};

// Brand colors and status colors serve different purposes. Components should use
// these tokens instead of embedding grade-specific hex values.
export const semanticColors = {
  airQuality: {
    good: { tone: '#3D7FEA', soft: '#E8F1FE', border: '#BDD2F1' },
    moderate: { tone: '#2F9B69', soft: '#E9F7F0', border: '#BFE6D1' },
    bad: { tone: '#E18B2D', soft: '#FFF4E5', border: '#F3D1A7' },
    veryBad: { tone: '#E05263', soft: '#FFF0F2', border: '#F0BBC2' },
    unavailable: { tone: '#718096', soft: '#F1F4F8', border: '#D8E0E9' },
  },
  outing: {
    fit: { tone: '#2F9B69', soft: '#E9F7F0', border: '#BFE6D1' },
    info: { tone: '#3D7FEA', soft: '#E8F1FE', border: '#BDD2F1' },
    caution: { tone: '#E18B2D', soft: '#FFF4E5', border: '#F3D1A7' },
    unfit: { tone: '#E05263', soft: '#FFF0F2', border: '#F0BBC2' },
    unavailable: { tone: '#718096', soft: '#F1F4F8', border: '#D8E0E9' },
  },
  weather: {
    normal: { tone: '#3D7FEA', soft: '#E8F1FE', border: '#BDD2F1' },
    caution: { tone: '#E18B2D', soft: '#FFF4E5', border: '#F3D1A7' },
    danger: { tone: '#E05263', soft: '#FFF0F2', border: '#F0BBC2' },
    unavailable: { tone: '#718096', soft: '#F1F4F8', border: '#D8E0E9' },
  },
} as const;
