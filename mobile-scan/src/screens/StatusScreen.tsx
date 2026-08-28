import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  title: string;
  message?: string;
  showSpinner?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  // For states where the primary action (e.g. "Réessayer") might keep
  // failing — without this, a persistently broken bootstrap has no escape
  // hatch to switch accounts.
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

// Shared shell for the non-camera, non-list full-screen states: initial
// bootstrap loading, "token valid but no scan access on this account", and
// "couldn't reach the server while checking your session." Keeping these as
// one component avoids three near-identical screens.
export function StatusScreen({
  title,
  message,
  showSpinner,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: Props) {
  return (
    <View style={styles.container}>
      {showSpinner ? <ActivityIndicator size="large" color="#5533E0" style={styles.spinner} /> : null}
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable style={styles.button} onPress={onAction}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <Pressable style={styles.secondaryButton} onPress={onSecondaryAction} hitSlop={8}>
          <Text style={styles.secondaryButtonText}>{secondaryActionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#F6F4EE',
  },
  spinner: {
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#17121F',
    textAlign: 'center',
  },
  message: {
    marginTop: 12,
    fontSize: 15,
    color: '#6E6779',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#5533E0',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 24,
  },
  buttonText: {
    color: '#F6F4EE',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: '#E0475C',
    fontSize: 14,
    fontWeight: '600',
  },
});
