import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  AppDashboardData,
  getAppDashboardData,
  InterpolatedIndicator,
  StationData,
} from "@/utils/api";
import { notifyIfAirQualityBad } from "@/utils/notifications";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";

const getAqiColors = (category: string) => {
  const normalized = category.toLowerCase();
  if (normalized.includes("bardzo dobry"))
    return { bg: "#d4edda", text: "#155724" }; // Green
  if (normalized.includes("dobry")) return { bg: "#c3e6cb", text: "#155724" }; // Light Green
  if (normalized.includes("umiarkowany"))
    return { bg: "#fff3cd", text: "#856404" }; // Yellow
  if (normalized.includes("dostateczny"))
    return { bg: "#ffeeba", text: "#856404" }; // Orange
  if (normalized.includes("zły") && !normalized.includes("bardzo"))
    return { bg: "#f8d7da", text: "#721c24" }; // Red
  if (normalized.includes("bardzo zły"))
    return { bg: "#e2d9f3", text: "#4a148c" }; // Purple
  return { bg: "#e2e3e5", text: "#383d41" }; // Default Grey
};

export default function HomeScreen() {
  const [data, setData] = useState<AppDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const dashboardData = await getAppDashboardData();
      setData(dashboardData);
      notifyIfAirQualityBad(dashboardData.interpolatedData.overall).catch(
        console.warn,
      );
    } catch (err: any) {
      setError(err.message || "Failed to fetch station data");
    } finally {
      setLoading(false);
    }
  };

  const renderIndicator = (
    name: string,
    indicatorData: { value: number | "-"; category: string },
    textColor: string,
  ) => (
    <View style={styles.indicatorContainer}>
      <Text style={[styles.indicatorName, { color: textColor }]}>{name}</Text>
      <Text style={[styles.indicatorValue, { color: textColor }]}>
        {indicatorData.value !== "-" ? `${indicatorData.value} µg/m³` : "-"}
      </Text>
      <Text
        style={[styles.indicatorCategory, { color: textColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {indicatorData.category}
      </Text>
    </View>
  );

  const renderInterpolatedIndicator = (
    name: string,
    indicator: InterpolatedIndicator,
  ) => {
    const textColor = isDark ? "#fff" : "#000";
    return (
      <View style={styles.indicatorContainer}>
        <Text style={[styles.indicatorName, { color: textColor }]}>{name}</Text>
        <Text style={[styles.indicatorValue, { color: textColor }]}>
          {indicator.value !== "-" ? `${indicator.value} µg/m³` : "-"}
        </Text>
        {indicator.category && (
          <Text
            style={[
              styles.indicatorCategory,
              { color: indicator.category.color },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {indicator.category.name}
          </Text>
        )}
      </View>
    );
  };

  const ListHeader = () => {
    if (!data) return null;
    return (
      <View
        style={[
          styles.card,
          styles.specialCard,
          {
            backgroundColor: isDark ? "#2c2c2c" : "#ffffff",
            borderColor: data.interpolatedData.overall?.color ?? "#4caf50",
          },
        ]}
      >
        <ThemedText style={styles.specialCardTitle}>Your Location</ThemedText>
        <ThemedText type="subtitle" style={styles.userLocationText}>
          {data.userLocation}
        </ThemedText>
        <ThemedText style={styles.interpolatedTitle}>
          Interpolated Local Air Quality
        </ThemedText>
        {data.interpolatedData.overall && (
          <Text
            style={[
              styles.overallCategory,
              { color: data.interpolatedData.overall.color },
            ]}
          >
            {data.interpolatedData.overall.name}
          </Text>
        )}
        <View style={styles.indicatorsGrid}>
          {renderInterpolatedIndicator("SO2", data.interpolatedData.so2)}
          {renderInterpolatedIndicator("NO2", data.interpolatedData.no2)}
          {renderInterpolatedIndicator("PM10", data.interpolatedData.pm10)}
          {renderInterpolatedIndicator("PM2.5", data.interpolatedData.pm25)}
          {renderInterpolatedIndicator("O3", data.interpolatedData.o3)}
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: StationData }) => {
    const colors = getAqiColors(item.overallQuality);

    return (
      <View style={[styles.card, { backgroundColor: colors.bg }]}>
        <View style={styles.cardHeader}>
          <View style={styles.stationInfo}>
            <Text style={[styles.stationName, { color: colors.text }]}>
              {item.name}
            </Text>
            <Text style={[styles.stationLocation, { color: colors.text }]}>
              {item.location}
            </Text>
            <Text style={[styles.stationDistance, { color: colors.text }]}>
              Distance: {item.distance.toFixed(1)} km
            </Text>
          </View>
          <View style={styles.aqiContainer}>
            <Text style={[styles.aqiValue, { color: colors.text }]}>
              {item.overallAqi}
            </Text>
            <Text style={[styles.aqiLabel, { color: colors.text }]}>
              AQI Index
            </Text>
          </View>
        </View>

        <View style={styles.statusContainer}>
          <Text style={[styles.statusText, { color: colors.text }]}>
            {item.overallQuality}
          </Text>
        </View>

        <View
          style={[
            styles.indicatorsGrid,
            { borderTopColor: `${colors.text}33` },
          ]}
        >
          {renderIndicator("SO2", item.so2, colors.text)}
          {renderIndicator("NO2", item.no2, colors.text)}
          {renderIndicator("PM10", item.pm10, colors.text)}
          {renderIndicator("PM2.5", item.pm25, colors.text)}
          {renderIndicator("O3", item.o3, colors.text)}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <ThemedText style={{ marginTop: 16 }}>
          Finding closest stations...
        </ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ThemedText
          type="subtitle"
          style={{ color: "red", textAlign: "center", marginBottom: 16 }}
        >
          {error}
        </ThemedText>
        <ThemedText onPress={loadData} type="link">
          Try Again
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Air Quality</ThemedText>
      </View>
      <FlatList
        data={data?.stations || []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  testButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  testButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  specialCard: {
    borderWidth: 2,
    borderColor: "#4caf50",
    marginBottom: 24,
  },
  specialCardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    opacity: 0.7,
    textTransform: "uppercase",
  },
  userLocationText: {
    marginVertical: 8,
    fontSize: 22,
  },
  interpolatedTitle: {
    marginTop: 12,
    fontWeight: "bold",
    borderTopWidth: 1,
    borderTopColor: "rgba(150, 150, 150, 0.2)",
    paddingTop: 12,
  },
  overallCategory: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  stationInfo: {
    flex: 1,
    paddingRight: 16,
  },
  stationName: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
  },
  stationLocation: {
    fontSize: 14,
    opacity: 0.8,
  },
  stationDistance: {
    fontSize: 12,
    opacity: 0.8,
    marginTop: 4,
    fontWeight: "500",
  },
  aqiContainer: {
    alignItems: "center",
  },
  aqiValue: {
    fontSize: 28,
    fontWeight: "bold",
  },
  aqiLabel: {
    fontSize: 12,
    fontWeight: "600",
    opacity: 0.8,
  },
  statusContainer: {
    marginBottom: 16,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
  },
  indicatorsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
    borderTopWidth: 1,
    paddingTop: 16,
  },
  indicatorContainer: {
    width: "30%",
    marginBottom: 8,
  },
  indicatorName: {
    fontSize: 12,
    fontWeight: "bold",
    opacity: 0.7,
  },
  indicatorValue: {
    fontSize: 18,
    fontWeight: "600",
    marginVertical: 4,
  },
  indicatorCategory: {
    fontSize: 12,
    opacity: 0.8,
  },
});
