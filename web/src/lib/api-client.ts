import axios from 'axios';
import { getToken, logout } from './auth';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only auto-redirect if we actually had a session that got rejected —
    // an anonymous 401 (wrong password on /auth/login, a gated public
    // endpoint, ...) must stay the caller's own error to handle, not force
    // a navigation away mid-form.
    if (error.response?.status === 401 && getToken() && window.location.pathname !== '/login') {
      logout();
    }
    return Promise.reject(error);
  },
);
