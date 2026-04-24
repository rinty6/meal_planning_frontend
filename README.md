# GoodHealthMate: Calorie Tracker & Smart Meal Planner

Welcome to **GoodHealthMate**! This is a full-stack health application designed specifically for Australians to track their daily nutrition and use Machine Learning to predict their ideal caloric intake.

## Product Summary

The mobile app is organized around a few core flows:

- authentication with Clerk
- onboarding and profile capture
- tab-based navigation for meals, calories, and profile
- personalized meal recommendation consumption through the backend API
- saved items and local app state for favorites, planning, notifications, and profile data

The current app structure reflects that split:

- `app/(auth)` contains sign-in, sign-up, and email verification routes
- `app/(onboarding)` contains the onboarding flow
- `app/(tabs)` contains the main in-app experience, including calorie, meal, and profile areas
- `components/` contains shared UI such as combo cards, recent meal modals, notification setup, food facts cards, and terms of service
- `services/` contains API clients and app-side state helpers for meals, planning, recommendations, favorites, notifications, barcode utilities, and profile sync

## Tech Stack

- Expo 54 with Expo Router
- React 19 and React Native 0.81
- Clerk Expo for authentication
- NativeWind and Tailwind-based styling
- Expo Notifications, Camera, Image Picker, Secure Store, and Updates
- TypeScript for the application codebase

## Local Development

### Prerequisites

- Node.js 20+
- npm
- Expo development environment for Android, iOS, or web testing

### Install

```bash
npm install
```

### Environment Variables

Create a local `.env` file from `.env.example` and provide values for:

- `EXPO_PUBLIC_BACKEND_URL`: base URL for the deployed or local backend API
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk publishable key for the mobile client
- `EXPO_PUBLIC_EAS_PROJECT_ID`: optional override if push token setup needs it explicitly
- `EXPO_PUBLIC_EXPERIENCE_ID`: Expo experience identifier used in some notification flows

### Run

```bash
npm start
```

Useful scripts:

- `npm run android`
- `npm run ios`
- `npm run web`
- `npm run lint`

## Build And Release

This app is already wired for EAS builds.

Current identifiers and release settings:

- iOS bundle identifier: `com.goodhealthmate.app`
- Android package: `com.goodhealthmate.app`
- URL scheme: `mealapp`
- EAS owner: `rinty6`
- EAS project ID: `b01bf15a-f4fe-457c-bcd4-c6737ab47587`
- OTA update URL: `https://u.expo.dev/b01bf15a-f4fe-457c-bcd4-c6737ab47587`

Configured EAS profiles:

- `preview`: internal distribution, Android APK output
- `production`: production channel, auto-increment enabled, Android App Bundle output

Typical commands:

```bash
eas build --platform android --profile preview
eas build --platform android --profile production
eas build --platform ios --profile production
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

## App Store Readiness Checklist

Before a public release, confirm these items are complete:

- replace placeholder or internal environment values with production secrets
- verify the visible product name and branding in `app.json` because the current Expo name is still `meal_app`
- prepare App Store and Play Store metadata, screenshots, support contact, and privacy policy links
- review notification, camera, image-picker, and authentication permissions text for store compliance
- test the production backend URL and Clerk configuration in a signed preview build
- verify in-app legal attribution for food data and images where required

Two release notes already visible in the wider project work are worth preserving here:

- Open Food Facts attribution should be present in the final legal flow if that dataset is surfaced to users
- FatSecret attribution requirements for food data and imagery should remain visible in-app or through linked legal pages

## Deployment Notes

The mobile app depends on both sibling services in this workspace:

- `../backend` for the main product API and notification endpoints
- `../machine_learning` indirectly through the backend recommendation routes

For the cleanest deployment pipeline:

1. deploy and validate the backend
2. confirm ML recommendation and prime endpoints are reachable from the backend
3. point `EXPO_PUBLIC_BACKEND_URL` at the deployed backend
4. generate an internal EAS preview build for real-device smoke testing
5. promote to production builds only after end-to-end verification

