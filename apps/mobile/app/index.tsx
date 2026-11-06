import { Redirect } from 'expo-router';
import { LoadingState } from '../src/components/Feedback';
import { useAuth } from '../src/context/AuthContext';

export default function IndexRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Restoring your secure BITS Kurnool session…"/>;
  return <Redirect href={(user ? '/(app)/dashboard' : '/login') as never}/>;
}
