export type MapPlaceSearchContext = {
  city: string;
  district: string;
  neighborhood: string;
};

export function nearbyPlaceQueries(query: string, context: MapPlaceSearchContext) {
  const broadArea = [context.city, context.district].filter(Boolean).join(' ');
  const preciseArea = [broadArea, context.neighborhood].filter(Boolean).join(' ');
  return [...new Set([preciseArea, broadArea].filter(Boolean))].map((area) => `${area} ${query}`);
}
