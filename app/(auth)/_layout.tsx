import { Redirect, Stack } from 'expo-router'
import { useAuth } from '@clerk/clerk-expo'


// To check if user is signed in, and redirect to home if they are
export default function AuthRoutesLayout() {
  const { isSignedIn } = useAuth()

  if (isSignedIn) {
    return <Redirect href={'/'} />
  }

  return <Stack screenOptions={{headerShown: false}}/>
}