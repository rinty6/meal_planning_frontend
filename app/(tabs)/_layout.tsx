import { TouchableOpacity } from 'react-native'
import { Tabs, Redirect, useRouter } from 'expo-router'
import { useAuth } from '@clerk/clerk-expo'
import { Ionicons } from '@expo/vector-icons'
import NotificationSetup from '../../components/NotificationSetup'

const TabLayout = () => {
  const { isSignedIn } = useAuth()
  const router = useRouter()

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
    <>
    <NotificationSetup />
    <Tabs 
        screenOptions={{ 
        headerShown: false,
        tabBarActiveTintColor: '#FF9500',
  
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
    </>
  )
}

export default TabLayout
