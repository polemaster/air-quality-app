import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { fetchInterpolatedQuality } from "./api";
import { GiosCategory } from "./math";

export const AIR_QUALITY_TASK = "air-quality-alert";
const LAST_NOTIFIED_KEY = "@aq_last_notified";
const STORED_COORDS_KEY = "@aq_last_coords";
const NOTIFY_COOLDOWN_MS = 2 * 60 * 60 * 1000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Air Quality Alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
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

async function sendNotification(title: string, body: string): Promise<void> {
  await AsyncStorage.setItem(LAST_NOTIFIED_KEY, Date.now().toString());
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger:
      Platform.OS === "android"
        ? {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 1,
            channelId: "default",
          }
        : null,
  });
}

export async function notifyIfAirQualityBad(
  overall: GiosCategory | null,
): Promise<void> {
  if (!overall || overall.index < 4) return;
  if (!(await canNotify())) return;
  await sendNotification("Zła jakość powietrza", `Indeks: ${overall.name}`);
}

export async function sendTestNotification(): Promise<void> {
  const stored = await AsyncStorage.getItem(STORED_COORDS_KEY);
  if (!stored) return;

  const { lat, lon } = JSON.parse(stored) as { lat: number; lon: number };
  const overall = await fetchInterpolatedQuality(lat, lon);
  await sendNotification("Jakość powietrza", `${overall?.name}`);
}

TaskManager.defineTask(AIR_QUALITY_TASK, async () => {
  try {
    const stored = await AsyncStorage.getItem(STORED_COORDS_KEY);
    if (!stored) return BackgroundTask.BackgroundTaskResult.Success;

    const { lat, lon } = JSON.parse(stored) as { lat: number; lon: number };
    const overall = await fetchInterpolatedQuality(lat, lon);
    await notifyIfAirQualityBad(overall);

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerAirQualityTask(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;

  const registered = await TaskManager.isTaskRegisteredAsync(AIR_QUALITY_TASK);
  if (!registered) {
    await BackgroundTask.registerTaskAsync(AIR_QUALITY_TASK, {
      minimumInterval: 15,
    });
  }
}
