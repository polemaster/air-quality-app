# Project Context

This is a React Native mobile application built using the Expo framework.
The app monitors local air quality using the Polish GIOŚ (Główny Inspektorat Ochrony Środowiska) API.
It utilizes background tasks to periodically fetch data and schedule daily local notifications.

# Tech Stack

- Framework: React Native with Expo (Managed Workflow)
- API Fetching: Axios
- Local Storage: @react-native-async-storage/async-storage
- Background Tasks: expo-background-fetch, expo-task-manager
- Notifications: expo-notifications
- Location: expo-location

# Core Architectural Rules

## 1. Expo & React Native Constraints

- STRICTLY adhere to the Expo Managed Workflow. Do NOT suggest linking native iOS (CocoaPods) or Android (Gradle) modules.
- Only use libraries compatible with Expo Go and Expo EAS build.
- Use functional React components and React Hooks (useState, useEffect, useCallback, useMemo). Do not use class components.
- Use standard React Native `StyleSheet` for styling.

## 2. Spatial Mathematics

- Whenever calculating spatial interpolation for air quality data between stations, strictly use **Inverse Distance Weighting (IDW)**.
- Use the Haversine formula to calculate distances between the user's latitude/longitude and station coordinates.

## 3. Background Processing & Notifications

- Assume mobile OS limitations: Background tasks cannot execute at exact, precise times.
- Use `expo-background-fetch` to periodically pull station data and user location.
- Save the interpolated IDW results to `AsyncStorage`.
- Use `expo-notifications` purely as local triggers to read the saved data from `AsyncStorage` at the user's preferred daily hour.

## 4. API & Data Handling

- Base API URL: https://api.gios.gov.pl/pjp-api/rest
- Handle API rate limits and network failures gracefully. Always wrap Axios calls in try/catch blocks and provide fallback UI states.
- Never fetch AQI data for all stations at once. Filter stations by radius (closest to the user) before fetching specific AQI indices.

## 5. Formatting & Style

- Write concise, self-documenting code.
- Extract complex mathematical logic (like IDW and Haversine) into separate utility files (e.g., `utils/math.ts`).
- Ensure all components have loading and error states handled.
