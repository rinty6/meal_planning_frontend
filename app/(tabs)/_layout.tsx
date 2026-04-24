import { Tabs, Redirect } from 'expo-router'
import { useAuth } from '@clerk/clerk-expo'
import { Ionicons } from '@expo/vector-icons'
import NotificationSetup from '../../components/NotificationSetup'

const TabLayout = () => {
  const { isSignedIn } = useAuth()

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
        }}
      />
    </Tabs>
    </>
  )
}

export default TabLayout