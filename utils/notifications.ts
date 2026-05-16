import * as Notifications from "expo-notifications";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchInterpolatedQuality } from "./api";
import { GiosCategory } from "./math";

export const AIR_QUALITY_TASK = "air-quality-alert";
const LAST_NOTIFIED_KEY = "@aq_last_notified";
const STORED_COORDS_KEY = "@aq_last_coords";
const NOTIFY_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours between alerts

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

async function canNotify(): Promise<boolean> {
  const last = await AsyncStorage.getItem(LAST_NOTIFIED_KEY);
  if (!last) return true;
  return Date.now() - parseInt(last, 10) > NOTIFY_COOLDOWN_MS;
}

export async function notifyIfAirQualityBad(
  overall: GiosCategory | null,
): Promise<void> {
  if (!overall || overall.index < 4) return;
  if (!(await canNotify())) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Ostrzeżenie: Zła jakość powietrza",
      body: `Jakość powietrza w Twojej okolicy: ${overall.name}. Ogranicz aktywność na zewnątrz.`,
      data: { qualityIndex: overall.index },
    },
    trigger: null,
  });

  await AsyncStorage.setItem(LAST_NOTIFIED_KEY, Date.now().toString());
}

TaskManager.defineTask(AIR_QUALITY_TASK, async () => {
  try {
    const stored = await AsyncStorage.getItem(STORED_COORDS_KEY);
    if (!stored) return BackgroundFetch.BackgroundFetchResult.NoData;

    const { lat, lon } = JSON.parse(stored) as { lat: number; lon: number };
    const overall = await fetchInterpolatedQuality(lat, lon);
    await notifyIfAirQualityBad(overall);

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerAirQualityTask(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync();
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
    status === BackgroundFetch.BackgroundFetchStatus.Denied
  )
    return;

  const registered = await TaskManager.isTaskRegisteredAsync(AIR_QUALITY_TASK);
  if (!registered) {
    await BackgroundFetch.registerTaskAsync(AIR_QUALITY_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }
}
