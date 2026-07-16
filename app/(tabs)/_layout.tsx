import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, TouchableOpacity, View, StyleSheet, Platform } from 'react-native'
import { Tabs, Redirect, useRouter, usePathname } from 'expo-router'
import { useAuth } from '@clerk/clerk-expo'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import NotificationSetup from '../../components/NotificationSetup'
import VoiceSearchModal from '../../components/VoiceSearchModal'

const FAB_SIZE = 66
const HALO_SIZE = 60
const FAB_POKE_ABOVE_BAR = 45 // how much of the FAB floats above the tab bar's top edge

// The FAB is a sibling of <Tabs>, not part of the tab bar, so it does NOT follow
// tabBarStyle. Any route that hides the tab bar must be listed here or the FAB
// keeps floating over that screen's content (profile/feedback hides the bar on
// focus, which left the mic sitting on its submit button).
const FAB_HIDDEN_ROUTES = ['/profile/feedback']

const VoiceSearchFab = ({ onPress }: { onPress: () => void }) => {
  const insets = useSafeAreaInsets()
  const tabBarHeight = (Platform.OS === 'ios' ? 49 : 56) + insets.bottom

  // Classic Animated API + useNativeDriver — NOT reanimated worklets: babel.config.js
  // sets worklets:false and New Architecture is off, so worklet code silently fails
  // (same constraint as StartupLoadingAnimation.tsx; see ERROR_LOG Error 007).
  // One driver feeds both scale and opacity so they can never drift out of sync.
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  // The halo is smaller than the FAB, so it only becomes visible once it expands
  // past the FAB's edge (~scale 1.1); opacity reaches 0 exactly as the cycle ends,
  // leaving no dead gap before the next ping.
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.9] })
  const haloOpacity = pulse.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.5, 0] })

  return (
    <View pointerEvents="box-none" style={[styles.fabWrap, { bottom: tabBarHeight - FAB_POKE_ABOVE_BAR }]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
      />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Voice search" activeOpacity={0.85} onPress={onPress} style={styles.fabButton}>
        <LinearGradient
          colors={['#FFB84D', '#FF7A00']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.fabGradient}
        >
          <Ionicons name="mic" size={28} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  )
}

const TabLayout = () => {
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [voiceSearchVisible, setVoiceSearchVisible] = useState(false)

  const openMealMenu = () => {
    router.navigate('/(tabs)/meal')
  }

  const openProfileRoot = () => {
    router.navigate('/(tabs)/profile')
  }

  // 1. Security Check
  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />
  }

  // 2. Actually return the Tabs component!
  return (
    <View style={{ flex: 1 }}>
    <NotificationSetup />
    <Tabs
        screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FF9500',
        tabBarInactiveTintColor: '#7C93B5',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarStyle: {
          backgroundColor: '#0B2149',
          borderTopWidth: 0,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
        },
    }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="meal"
        options={{
          title: 'Meal',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "restaurant" : "restaurant-outline"} size={24} color={color} />,
          tabBarButton: ({ children, accessibilityLabel, accessibilityState, onLongPress, style, testID }) => (
            <TouchableOpacity
              accessibilityLabel={accessibilityLabel}
              accessibilityRole="button"
              accessibilityState={accessibilityState}
              activeOpacity={0.7}
              onLongPress={onLongPress || undefined}
              onPress={openMealMenu}
              style={style}
              testID={testID}
            >
              {children}
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: '',
          // Reserves a fixed-width gap in the tab bar for the floating FAB
          // (rendered separately below, absolutely positioned) — this slot
          // itself is invisible and non-interactive.
          tabBarButton: () => <View style={{ width: 74 }} />,
        }}
      />
      <Tabs.Screen
        name="calorie"
        options={{
          title: 'Calorie',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "heart" : "heart-outline"} size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />,
          tabBarButton: ({ children, accessibilityLabel, accessibilityState, onLongPress, style, testID }) => (
            <TouchableOpacity
              accessibilityLabel={accessibilityLabel}
              accessibilityRole="button"
              accessibilityState={accessibilityState}
              activeOpacity={0.7}
              onLongPress={onLongPress || undefined}
              onPress={openProfileRoot}
              style={style}
              testID={testID}
            >
              {children}
            </TouchableOpacity>
          ),
        }}
      />
    </Tabs>
    {!FAB_HIDDEN_ROUTES.includes(pathname) && <VoiceSearchFab onPress={() => setVoiceSearchVisible(true)} />}
    <VoiceSearchModal visible={voiceSearchVisible} onClose={() => setVoiceSearchVisible(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  fabWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  halo: {
    position: 'absolute',
    top: (FAB_SIZE - HALO_SIZE) / 2,
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    backgroundColor: '#FF9500',
  },
  fabButton: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderWidth: 4,
    borderColor: '#EFF3F7',
    shadowColor: '#FF7A00',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  fabGradient: {
    flex: 1,
    borderRadius: (FAB_SIZE - 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default TabLayout
