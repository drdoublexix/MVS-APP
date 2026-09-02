import { Redirect, useLocalSearchParams } from 'expo-router';

export default function ClientChatRoute() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  return <Redirect href={{ pathname: '/chat', params }} />;
}
