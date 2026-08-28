import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { listEvents } from '../api/events';
import { classifyApiError } from '../logic/classifyApiError';
import type { RootStackParamList } from '../navigation/types';
import type { EventSummary } from '../types/api';

function isScannable(event: EventSummary): boolean {
  return event.status === 'PUBLISHED' && new Date(event.endAt).getTime() > Date.now();
}

export function EventSelectionScreen() {
  const { organizationId, organizationName, logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setErrorMessage(null);
    try {
      const all = await listEvents(organizationId);
      const scannable = all
        .filter(isScannable)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      setEvents(scannable);
    } catch (err) {
      const classified = classifyApiError(err);
      setErrorMessage(
        classified.kind === 'NETWORK'
          ? 'Pas de connexion au serveur.'
          : 'Impossible de charger les évènements.',
      );
      setEvents(null);
    }
  }, [organizationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.orgName}>{organizationName}</Text>
        <Pressable onPress={logout} hitSlop={8}>
          <Text style={styles.logout}>Déconnexion</Text>
        </Pressable>
      </View>

      {errorMessage ? (
        <View style={styles.centered}>
          <Text style={styles.message}>{errorMessage}</Text>
          <Pressable style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : events === null ? (
        <View style={styles.centered}>
          <Text style={styles.message}>Chargement…</Text>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.message}>Aucun évènement actif pour le moment.</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                navigation.navigate('Scanner', {
                  organizationId: organizationId!,
                  eventId: item.id,
                  eventName: item.name,
                })
              }
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              {item.venueName ? <Text style={styles.cardSubtitle}>{item.venueName}</Text> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F4EE',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  orgName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#17121F',
  },
  logout: {
    color: '#E0475C',
    fontSize: 14,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  message: {
    fontSize: 15,
    color: '#6E6779',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#5533E0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: {
    color: '#F6F4EE',
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#17121F',
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#6E6779',
  },
});
