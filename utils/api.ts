import axios from "axios";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { calculateDistance, idwInterpolation, getGiosCategory, getWorstGiosCategory, GiosCategory } from "./math";

const STORED_COORDS_KEY = "@aq_last_coords";

const API_BASE_URL = "https://api.gios.gov.pl/pjp-api/v1/rest";

export interface Station {
  id: number;
  name: string;
  location: string;
  lat: number;
  lon: number;
  distance?: number;
}

export interface IndicatorData {
  value: number | "-";
  category: string;
}

export interface StationData {
  id: string;
  name: string;
  location: string;
  distance: number;
  overallAqi: number | "-";
  overallQuality: string;
  so2: IndicatorData;
  no2: IndicatorData;
  pm10: IndicatorData;
  pm25: IndicatorData;
  o3: IndicatorData;
}

export { GiosCategory };

export interface InterpolatedIndicator {
  value: number | "-";
  category: GiosCategory | null;
}

export interface AppDashboardData {
  stations: StationData[];
  userLocation: string;
  interpolatedData: {
    so2: InterpolatedIndicator;
    no2: InterpolatedIndicator;
    pm10: InterpolatedIndicator;
    pm25: InterpolatedIndicator;
    o3: InterpolatedIndicator;
    overall: GiosCategory | null;
  };
}

export const fetchStationsByCity = async (city: string): Promise<Station[]> => {
  const response = await axios.get(
    `${API_BASE_URL}/metadata/stations?filter%5Bmiejscowosc%5D=${encodeURIComponent(city)}`,
  );
  const list: any[] =
    response.data["Lista metadanych stacji pomiarowych"] || [];
  return list
    .filter((item) => !item["Data zamknięcia"])
    .map((item) => ({
      id: item["Nr"],
      name: item["Nazwa stacji"],
      location: item["Adres"]
        ? `${item["Miejscowość"]}, ${item["Adres"]}`
        : item["Miejscowość"],
      lat: parseFloat(item["WGS84 φ N"]),
      lon: parseFloat(item["WGS84 λ E"]),
    }));
};

const fetchAllStations = async (): Promise<Station[]> => {
  const response = await axios.get(`${API_BASE_URL}/station/findAll`);
  const list = response.data["Lista stacji pomiarowych"] || [];
  return list.map((item: any) => ({
    id: item["Identyfikator stacji"],
    name: item["Nazwa stacji"],
    location: item["Ulica"]
      ? `${item["Nazwa miasta"]}, ${item["Ulica"]}`
      : item["Nazwa miasta"],
    lat: parseFloat(item["WGS84 φ N"]),
    lon: parseFloat(item["WGS84 λ E"]),
  }));
};

export const fetchStationSensors = async (stationId: number) => {
  const response = await axios.get(
    `${API_BASE_URL}/station/sensors/${stationId}`,
  );
  return response.data["Lista stanowisk pomiarowych dla podanej stacji"] || [];
};

export const fetchSensorData = async (
  sensorId: number,
): Promise<number | "-"> => {
  const response = await axios.get(`${API_BASE_URL}/data/getData/${sensorId}`);
  const list = response.data["Lista danych pomiarowych"] || [];
  for (const item of list) {
    if (item["Wartość"] !== null && item["Wartość"] !== undefined) {
      return Math.round(item["Wartość"]);
    }
  }
  return "-";
};

export const fetchStationIndex = async (stationId: number) => {
  const response = await axios.get(
    `${API_BASE_URL}/aqindex/getIndex/${stationId}`,
  );
  return response.data["AqIndex"] || {};
};

const mapIndexCategory = (index: any): string => {
  if (!index || index === "Brak indeksu" || index === -1) return "-";
  return index;
};

export const getAppDashboardData = async (): Promise<AppDashboardData> => {
  // Request location permissions
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Permission to access location was denied");
  }

  // Get current location — env vars override GPS for dev/simulator use
  const devLat = process.env.EXPO_PUBLIC_DEFAULT_LAT
    ? parseFloat(process.env.EXPO_PUBLIC_DEFAULT_LAT)
    : null;
  const devLon = process.env.EXPO_PUBLIC_DEFAULT_LON
    ? parseFloat(process.env.EXPO_PUBLIC_DEFAULT_LON)
    : null;

  let latitude: number;
  let longitude: number;

  if (devLat !== null && devLon !== null && !isNaN(devLat) && !isNaN(devLon)) {
    latitude = devLat;
    longitude = devLon;
  } else {
    const location = await Location.getCurrentPositionAsync({});
    latitude = location.coords.latitude;
    longitude = location.coords.longitude;
  }

  AsyncStorage.setItem(
    STORED_COORDS_KEY,
    JSON.stringify({ lat: latitude, lon: longitude }),
  ).catch(() => {});

  let userLocationName = "Unknown Location";
  let city = "";
  try {
    const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (GOOGLE_API_KEY) {
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&language=pl&key=${GOOGLE_API_KEY}`,
      );
      if (response.data.results && response.data.results.length > 0) {
        const result = response.data.results[0];
        userLocationName = result.formatted_address || "Unknown Location";
        const locality = result.address_components?.find((c: any) =>
          c.types.includes("locality"),
        );
        city = locality?.long_name || "";
      } else {
        userLocationName = "Location not found";
      }
    } else {
      console.warn(
        "Google Maps API key is missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.",
      );
    }
  } catch (e) {
    console.warn("Google Maps reverse geocoding failed", e);
  }

  // Fetch stations for the user's city; fall back to all stations sorted by distance
  let stations: Station[] = [];
  if (city) {
    try {
      stations = await fetchStationsByCity(city);
    } catch (e) {
      console.warn(
        `Failed to fetch stations for city "${city}", falling back to all stations`,
        e,
      );
    }
  }
  if (stations.length === 0) {
    stations = await fetchAllStations();
  }

  // Calculate distance and sort, then take the 5 closest
  stations.forEach((station) => {
    station.distance = calculateDistance(
      latitude,
      longitude,
      station.lat,
      station.lon,
    );
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
        const sensor = sensors.find(
          (s: any) => s["Wskaźnik - kod"] === paramCode,
        );
        if (sensor) {
          return fetchSensorData(sensor["Identyfikator stanowiska"]);
        }
        return "-";
      };

      const [so2Val, no2Val, pm10Val, pm25Val, o3Val] = await Promise.all([
        getSensorData("SO2"),
        getSensorData("NO2"),
        getSensorData("PM10"),
        getSensorData("PM2.5"),
        getSensorData("O3"),
      ]);

      return {
        id: station.id.toString(),
        name: station.name,
        location: station.location,
        distance: station.distance || 0,
        overallAqi:
          aqIndex["Wartość indeksu"] !== undefined &&
          aqIndex["Wartość indeksu"] !== -1
            ? aqIndex["Wartość indeksu"]
            : "-",
        overallQuality: mapIndexCategory(aqIndex["Nazwa kategorii indeksu"]),
        so2: {
          value: so2Val,
          category: mapIndexCategory(
            aqIndex["Nazwa kategorii indeksu dla wskażnika SO2"],
          ),
        },
        no2: {
          value: no2Val,
          category: mapIndexCategory(
            aqIndex["Nazwa kategorii indeksu dla wskażnika NO2"],
          ),
        },
        pm10: {
          value: pm10Val,
          category: mapIndexCategory(
            aqIndex["Nazwa kategorii indeksu dla wskażnika PM10"],
          ),
        },
        pm25: {
          value: pm25Val,
          category: mapIndexCategory(
            aqIndex["Nazwa kategorii indeksu dla wskażnika PM2.5"],
          ),
        },
        o3: {
          value: o3Val,
          category: mapIndexCategory(
            aqIndex["Nazwa kategorii indeksu dla wskażnika O3"],
          ),
        },
      } as StationData;
    } catch (e) {
      console.warn(`Failed to fetch data for station ${station.id}`, e);
      return {
        id: station.id.toString(),
        name: station.name,
        location: station.location,
        distance: station.distance || 0,
        overallAqi: "-",
        overallQuality: "-",
        so2: { value: "-", category: "-" },
        no2: { value: "-", category: "-" },
        pm10: { value: "-", category: "-" },
        pm25: { value: "-", category: "-" },
        o3: { value: "-", category: "-" },
      } as StationData;
    }
  });

  const detailedStations = await Promise.all(stationDataPromises);

  const getValidDataWithDistances = (
    key: "so2" | "no2" | "pm10" | "pm25" | "o3",
  ) => {
    return detailedStations
      .filter((s) => s[key].value !== "-")
      .map((s) => ({ value: s[key].value as number, distance: s.distance }));
  };

  const toIndicator = (
    pollutant: "so2" | "no2" | "pm10" | "pm25" | "o3",
  ): InterpolatedIndicator => {
    const value = idwInterpolation(getValidDataWithDistances(pollutant));
    return {
      value,
      category: typeof value === "number" ? getGiosCategory(pollutant, value) : null,
    };
  };

  const so2 = toIndicator("so2");
  const no2 = toIndicator("no2");
  const pm10 = toIndicator("pm10");
  const pm25 = toIndicator("pm25");
  const o3 = toIndicator("o3");

  const presentCategories = [so2, no2, pm10, pm25, o3]
    .map((i) => i.category)
    .filter((c): c is GiosCategory => c !== null);

  return {
    stations: detailedStations,
    userLocation: userLocationName,
    interpolatedData: {
      so2,
      no2,
      pm10,
      pm25,
      o3,
      overall: getWorstGiosCategory(presentCategories),
    },
  };
};

type PollutantRow = {
  distance: number;
  so2: number | "-";
  no2: number | "-";
  pm10: number | "-";
  pm25: number | "-";
  o3: number | "-";
};

export const fetchInterpolatedQuality = async (
  latitude: number,
  longitude: number,
): Promise<GiosCategory | null> => {
  const stations = await fetchAllStations();
  stations.forEach((s) => {
    s.distance = calculateDistance(latitude, longitude, s.lat, s.lon);
  });
  stations.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  const top5 = stations.slice(0, 5);

  const rows = (
    await Promise.all(
      top5.map(async (station): Promise<PollutantRow | null> => {
        try {
          const sensors = await fetchStationSensors(station.id);
          const get = async (code: string): Promise<number | "-"> => {
            const s = sensors.find((x: any) => x["Wskaźnik - kod"] === code);
            return s ? fetchSensorData(s["Identyfikator stanowiska"]) : "-";
          };
          const [so2, no2, pm10, pm25, o3] = await Promise.all([
            get("SO2"),
            get("NO2"),
            get("PM10"),
            get("PM2.5"),
            get("O3"),
          ]);
          return { distance: station.distance ?? 0, so2, no2, pm10, pm25, o3 };
        } catch {
          return null;
        }
      }),
    )
  ).filter((r): r is PollutantRow => r !== null);

  const toCategory = (
    key: keyof Omit<PollutantRow, "distance">,
    pollutant: "so2" | "no2" | "pm10" | "pm25" | "o3",
  ) => {
    const pairs = rows
      .filter((r) => r[key] !== "-")
      .map((r) => ({ value: r[key] as number, distance: r.distance }));
    const val = idwInterpolation(pairs);
    return typeof val === "number" ? getGiosCategory(pollutant, val) : null;
  };

  const categories = [
    toCategory("so2", "so2"),
    toCategory("no2", "no2"),
    toCategory("pm10", "pm10"),
    toCategory("pm25", "pm25"),
    toCategory("o3", "o3"),
  ].filter((c): c is GiosCategory => c !== null);

  return getWorstGiosCategory(categories);
};
