# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

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
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
