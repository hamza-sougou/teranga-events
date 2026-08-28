import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ScanOutcome } from '../logic/interpretScanResult';

const AUTO_DISMISS_MS = 1500;

// Palette mirrors docs/DESIGN_SYSTEM.md's existing semantic tokens (emerald =
// positive/verified, amber = pending/already-happened, orange/rose = negative
// variants). NO_CONNECTION intentionally uses --ink, a color no ticket
// verdict ever uses, so a dropped connection can never be mistaken for a
// real scan result by someone glancing quickly in the dark.
const STYLES: Record<ScanOutcome['kind'], { background: string; foreground: string; title: string }> = {
  SUCCESS: { background: '#0FBF8F', foreground: '#F6F4EE', title: 'Billet valide' },
  ALREADY_USED: { background: '#FFB627', foreground: '#17121F', title: 'Déjà scanné' },
  INVALID: { background: '#E0475C', foreground: '#F6F4EE', title: 'Billet invalide' },
  EXPIRED_EVENT: { background: '#FF7A3D', foreground: '#F6F4EE', title: 'Évènement terminé' },
  NO_CONNECTION: { background: '#17121F', foreground: '#F6F4EE', title: 'Pas de connexion' },
  SCAN_ERROR: { background: '#17121F', foreground: '#F6F4EE', title: 'Erreur' },
};

function subtitleFor(outcome: ScanOutcome): string | null {
  switch (outcome.kind) {
    case 'SUCCESS':
      return [outcome.holderName, outcome.ticketTypeName].filter(Boolean).join(' — ');
    case 'ALREADY_USED':
      return outcome.ticketTypeName;
    case 'NO_CONNECTION':
      return 'Réessayez le scan';
    case 'SCAN_ERROR':
      return outcome.message;
    default:
      return null;
  }
}

interface Props {
  outcome: ScanOutcome;
  onDismiss: () => void;
}

export function ScanResultOverlay({ outcome, onDismiss }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [outcome, onDismiss]);

  const style = STYLES[outcome.kind];
  const subtitle = subtitleFor(outcome);

  return (
    <Pressable
      style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: style.background }]}
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityLabel={`${style.title}. Toucher pour continuer.`}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: style.foreground }]}>{style.title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: style.foreground }]}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  content: {
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 18,
    textAlign: 'center',
    opacity: 0.9,
  },
});
