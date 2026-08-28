import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { EventSelectionScreen } from '../screens/EventSelectionScreen';
import { ScannerScreen } from '../screens/ScannerScreen';
import { StatusScreen } from '../screens/StatusScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { status, retryBootstrap, logout } = useAuth();

  if (status === 'loading') {
    return <StatusScreen title="Chargement…" showSpinner />;
  }

  if (status === 'bootstrapError') {
    return (
      <StatusScreen
        title="Connexion au serveur impossible"
        message="Vérifiez votre réseau et réessayez."
        actionLabel="Réessayer"
        onAction={retryBootstrap}
        secondaryActionLabel="Se déconnecter"
        onSecondaryAction={logout}
      />
    );
  }

  if (status === 'signedOut') {
    return (
      <NavigationContainer>
        <LoginScreen />
      </NavigationContainer>
    );
  }

  if (status === 'noScanAccess') {
    return (
      <StatusScreen
        title="Accès au scan non autorisé"
        message="Ce compte n'a pas de rôle donnant accès au scan sur une organisation active."
        actionLabel="Déconnexion"
        onAction={logout}
      />
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="EventSelection" component={EventSelectionScreen} />
        <Stack.Screen name="Scanner" component={ScannerScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
