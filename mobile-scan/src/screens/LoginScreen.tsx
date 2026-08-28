import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { classifyApiError } from '../logic/classifyApiError';

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      const classified = classifyApiError(err);
      if (classified.kind === 'NETWORK') {
        setError('Pas de connexion au serveur. Vérifiez votre réseau et réessayez.');
      } else if (classified.kind === 'API' && classified.statusCode === 401) {
        setError('Email ou mot de passe incorrect.');
      } else {
        setError('Une erreur est survenue. Réessayez.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Zen Events — Scan</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#6E6779"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!submitting}
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        placeholderTextColor="#6E6779"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!submitting}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting || !email || !password}
      >
        {submitting ? <ActivityIndicator color="#F6F4EE" /> : <Text style={styles.buttonText}>Se connecter</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#F6F4EE',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#17121F',
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#17121F',
    marginBottom: 12,
  },
  error: {
    color: '#E0475C',
    marginBottom: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#5533E0',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#F6F4EE',
    fontSize: 16,
    fontWeight: '600',
  },
});
