import axios from 'axios';
import * as Location from 'expo-location';
import { calculateDistance, idwInterpolation } from './math';

const API_BASE_URL = 'https://api.gios.gov.pl/pjp-api/v1/rest';

export interface Station {
  id: number;
  name: string;
  location: string;
  lat: number;
  lon: number;
  distance?: number;
}

export interface IndicatorData {
  value: number | '-';
  category: string;
}

export interface StationData {
  id: string;
  name: string;
  location: string;
  distance: number;
  overallAqi: number | '-';
  overallQuality: string;
  so2: IndicatorData;
  no2: IndicatorData;
  pm10: IndicatorData;
  pm25: IndicatorData;
  o3: IndicatorData;
}

export interface AppDashboardData {
  stations: StationData[];
  userLocation: string;
  interpolatedData: {
    so2: number | '-';
    no2: number | '-';
    pm10: number | '-';
    pm25: number | '-';
    o3: number | '-';
  };
}

export const fetchStations = async (): Promise<Station[]> => {
  const response = await axios.get(`${API_BASE_URL}/station/findAll`);
  const list = response.data['Lista stacji pomiarowych'] || [];
  return list.map((item: any) => ({
    id: item['Identyfikator stacji'],
    name: item['Nazwa stacji'],
    location: item['Ulica'] ? `${item['Nazwa miasta']}, ${item['Ulica']}` : item['Nazwa miasta'],
    lat: parseFloat(item['WGS84 φ N']),
    lon: parseFloat(item['WGS84 λ E']),
  }));
};

export const fetchStationSensors = async (stationId: number) => {
  const response = await axios.get(`${API_BASE_URL}/station/sensors/${stationId}`);
  return response.data['Lista stanowisk pomiarowych dla podanej stacji'] || [];
};

export const fetchSensorData = async (sensorId: number): Promise<number | '-'> => {
  const response = await axios.get(`${API_BASE_URL}/data/getData/${sensorId}`);
  const list = response.data['Lista danych pomiarowych'] || [];
  for (const item of list) {
    if (item['Wartość'] !== null && item['Wartość'] !== undefined) {
      return Math.round(item['Wartość']);
    }
  }
  return '-';
};

export const fetchStationIndex = async (stationId: number) => {
  const response = await axios.get(`${API_BASE_URL}/aqindex/getIndex/${stationId}`);
  return response.data['AqIndex'] || {};
};

const mapIndexCategory = (index: any): string => {
  if (!index || index === 'Brak indeksu' || index === -1) return '-';
  return index;
};

export const getAppDashboardData = async (): Promise<AppDashboardData> => {
  // Request location permissions
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Permission to access location was denied');
  }

  // Get current location
  const location = await Location.getCurrentPositionAsync({});
  const { latitude, longitude } = location.coords;

  let userLocationName = 'Unknown Location';
  try {
    const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (GOOGLE_API_KEY) {
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_API_KEY}`
      );
      if (response.data.results && response.data.results.length > 0) {
        userLocationName = response.data.results[0].formatted_address || 'Unknown Location';
      } else {
        userLocationName = 'Location not found';
      }
    } else {
      console.warn('Google Maps API key is missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.');
    }
  } catch (e) {
    console.warn('Google Maps reverse geocoding failed', e);
  }

  // Fetch all stations
  const stations = await fetchStations();

  // Calculate distance and sort
  stations.forEach(station => {
    station.distance = calculateDistance(latitude, longitude, station.lat, station.lon);
  });
  
  stations.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  const top5 = stations.slice(0, 5);

  // Fetch detailed data for top 5 stations
  const stationDataPromises = top5.map(async (station) => {
    try {
      const [sensors, aqIndex] = await Promise.all([
        fetchStationSensors(station.id),
        fetchStationIndex(station.id),
      ]);

      const getSensorData = async (paramCode: string) => {
        const sensor = sensors.find((s: any) => s['Wskaźnik - kod'] === paramCode);
        if (sensor) {
          return fetchSensorData(sensor['Identyfikator stanowiska']);
        }
        return '-';
      };

      const [so2Val, no2Val, pm10Val, pm25Val, o3Val] = await Promise.all([
        getSensorData('SO2'),
        getSensorData('NO2'),
        getSensorData('PM10'),
        getSensorData('PM2.5'),
        getSensorData('O3'),
      ]);

      return {
        id: station.id.toString(),
        name: station.name,
        location: station.location,
        distance: station.distance || 0,
        overallAqi: (aqIndex['Wartość indeksu'] !== undefined && aqIndex['Wartość indeksu'] !== -1) ? aqIndex['Wartość indeksu'] : '-', 
        overallQuality: mapIndexCategory(aqIndex['Nazwa kategorii indeksu']),
        so2: { value: so2Val, category: mapIndexCategory(aqIndex['Nazwa kategorii indeksu dla wskażnika SO2']) },
        no2: { value: no2Val, category: mapIndexCategory(aqIndex['Nazwa kategorii indeksu dla wskażnika NO2']) },
        pm10: { value: pm10Val, category: mapIndexCategory(aqIndex['Nazwa kategorii indeksu dla wskażnika PM10']) },
        pm25: { value: pm25Val, category: mapIndexCategory(aqIndex['Nazwa kategorii indeksu dla wskażnika PM2.5']) },
        o3: { value: o3Val, category: mapIndexCategory(aqIndex['Nazwa kategorii indeksu dla wskażnika O3']) },
      } as StationData;
    } catch (e) {
      console.warn(`Failed to fetch data for station ${station.id}`, e);
      return {
        id: station.id.toString(),
        name: station.name,
        location: station.location,
        distance: station.distance || 0,
        overallAqi: '-',
        overallQuality: '-',
        so2: { value: '-', category: '-' },
        no2: { value: '-', category: '-' },
        pm10: { value: '-', category: '-' },
        pm25: { value: '-', category: '-' },
        o3: { value: '-', category: '-' },
      } as StationData;
    }
  });

  const detailedStations = await Promise.all(stationDataPromises);

  const getValidDataWithDistances = (key: 'so2' | 'no2' | 'pm10' | 'pm25' | 'o3') => {
    return detailedStations
      .filter(s => s[key].value !== '-')
      .map(s => ({ value: s[key].value as number, distance: s.distance }));
  };

  const interpolatedData = {
    so2: idwInterpolation(getValidDataWithDistances('so2')),
    no2: idwInterpolation(getValidDataWithDistances('no2')),
    pm10: idwInterpolation(getValidDataWithDistances('pm10')),
    pm25: idwInterpolation(getValidDataWithDistances('pm25')),
    o3: idwInterpolation(getValidDataWithDistances('o3')),
  };

  return {
    stations: detailedStations,
    userLocation: userLocationName,
    interpolatedData,
  };
};