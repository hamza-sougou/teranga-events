import * as SecureStore from 'expo-secure-store';

// The ONLY place the JWT is allowed to touch storage. Never AsyncStorage,
// never a plain module-level variable — see CLAUDE.md security requirements
// for this app. Never log `token` anywhere, including here.
const TOKEN_KEY = 'mobile_scan_access_token';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
