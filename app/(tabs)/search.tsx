import { Redirect } from 'expo-router';

// This route exists only so the tab bar reserves a flex slot for the voice
// search FAB (see (tabs)/_layout.tsx). The FAB's tabBarButton always
// intercepts the press to open VoiceSearchModal instead of navigating here,
// but redirect home in case this route is ever reached directly (e.g. a stale
// deep link).
export default function SearchTabPlaceholder() {
  return <Redirect href="/(tabs)" />;
}
