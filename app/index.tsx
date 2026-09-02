import { Redirect } from 'expo-router';

export default function Index() {
  // If unauthenticated, redirect straight to the signup screen (which includes role selection)
  return <Redirect href="/(auth)/signup" />;
}
