import { apiRequest } from './client';
import type { LoginResponse, MeResponse } from '../types/api';

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}

export function me(): Promise<MeResponse> {
  return apiRequest<MeResponse>('/auth/me');
}
