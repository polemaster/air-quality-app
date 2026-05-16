export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function idwInterpolation(valuesWithDistances: { value: number; distance: number }[], power: number = 2): number | '-' {
  if (valuesWithDistances.length === 0) return '-';
  
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

