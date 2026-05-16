export interface GiosCategory {
  index: number;
  name: string;
  color: string;
}

const GIOS_LEVELS: GiosCategory[] = [
  { index: 0, name: "Bardzo dobry", color: "#1a7f37" },
  { index: 1, name: "Dobry", color: "#4d8000" },
  { index: 2, name: "Umiarkowany", color: "#b8860b" },
  { index: 3, name: "Dostateczny", color: "#cc5500" },
  { index: 4, name: "Zły", color: "#cc0000" },
  { index: 5, name: "Bardzo zły", color: "#660099" },
];

// Upper bound (inclusive) for each level 0–4; anything above level 4 = level 5.
const GIOS_BREAKPOINTS: Record<string, number[]> = {
  so2: [50, 100, 200, 350, 500],
  no2: [40, 100, 150, 200, 300],
  pm10: [20, 60, 100, 140, 200],
  pm25: [13, 35, 55, 75, 110],
  o3: [70, 120, 150, 180, 240],
};

export function getGiosCategory(
  pollutant: "so2" | "no2" | "pm10" | "pm25" | "o3",
  value: number,
): GiosCategory {
  const bounds = GIOS_BREAKPOINTS[pollutant];
  const idx = bounds.findIndex((bound) => value <= bound);
  return GIOS_LEVELS[idx === -1 ? 5 : idx];
}

export function getWorstGiosCategory(
  categories: GiosCategory[],
): GiosCategory | null {
  if (categories.length === 0) return null;
  return categories.reduce((worst, cat) =>
    cat.index > worst.index ? cat : worst,
  );
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function idwInterpolation(
  valuesWithDistances: { value: number; distance: number }[],
  power: number = 2,
): number | "-" {
  if (valuesWithDistances.length === 0) return "-";

  let numerator = 0;
  let denominator = 0;

  for (const item of valuesWithDistances) {
    if (item.distance === 0) return item.value; // Avoid division by zero, exact match
    const weight = 1 / Math.pow(item.distance, power);
    numerator += item.value * weight;
    denominator += weight;
  }

  return denominator === 0 ? 0 : Math.round(numerator / denominator);
}
