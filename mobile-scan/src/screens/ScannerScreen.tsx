import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { scanTicket } from '../api/scan';
import { classifyApiError } from '../logic/classifyApiError';
import { interpretScanFailure, interpretScanSuccess, type ScanOutcome } from '../logic/interpretScanResult';
import { ScanResultOverlay } from '../components/ScanResultOverlay';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Scanner'>;

function triggerHaptic(outcome: ScanOutcome) {
  const type =
    outcome.kind === 'SUCCESS'
      ? Haptics.NotificationFeedbackType.Success
      : outcome.kind === 'ALREADY_USED' || outcome.kind === 'NO_CONNECTION'
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Error;
  Haptics.notificationAsync(type).catch(() => {
    // Haptics is a nice-to-have; a device without it must never block scanning.
  });
}

export function ScannerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<Props['route']>();
  const { organizationId, eventId, eventName } = params;
  const { logout } = useAuth();

  const [permission, requestPermission] = useCameraPermissions();
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const isProcessingRef = useRef(false);

  const handleScan = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      // Gate on an in-flight request, not a timer — the real duplicate-fire
      // risk is the camera calling this again before the first network
      // round-trip finishes, not the user re-presenting the same QR quickly.
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      let result: ScanOutcome;
      try {
        const response = await scanTicket(organizationId, eventId, data);
        result = interpretScanSuccess(response);
      } catch (err) {
        result = interpretScanFailure(classifyApiError(err));
      }

      triggerHaptic(result);
      setOutcome(result);
    },
    [organizationId, eventId],
  );

  const dismissOverlay = useCallback(() => {
    setOutcome(null);
    isProcessingRef.current = false;
  }, []);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Accès à la caméra requis</Text>
        <Text style={styles.permissionMessage}>
          Zen Events a besoin de la caméra pour scanner les billets à l'entrée.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Autoriser la caméra</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={outcome ? undefined : handleScan}
      />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.headerAction}>{'‹ Évènements'}</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {eventName}
        </Text>
        <Pressable onPress={logout} hitSlop={8}>
          <Text style={styles.headerAction}>Déconnexion</Text>
        </Pressable>
      </View>

      {outcome ? <ScanResultOverlay outcome={outcome} onDismiss={dismissOverlay} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(23,18,31,0.55)',
    gap: 16,
  },
  headerAction: {
    color: '#F6F4EE',
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    color: '#F6F4EE',
    fontSize: 15,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#F6F4EE',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#17121F',
    textAlign: 'center',
  },
  permissionMessage: {
    marginTop: 12,
    fontSize: 15,
    color: '#6E6779',
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 24,
    backgroundColor: '#5533E0',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  permissionButtonText: {
    color: '#F6F4EE',
    fontSize: 16,
    fontWeight: '600',
  },
});
