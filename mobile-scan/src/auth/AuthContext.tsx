import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import * as authApi from '../api/auth';
import { HttpError } from '../logic/classifyApiError';
import { clearToken, getToken, setToken } from './tokenStore';
import type { MemberRole, Membership, UserSummary } from '../types/api';

// Mirrors backend/src/scan/scan.controller.ts SCAN_ROLES exactly — this app
// is not exclusive to CONTROLLER, an owner/co-organizer can also scan at
// their own event. Keep in sync if the backend list ever changes.
const SCAN_ROLES: MemberRole[] = ['OWNER', 'CO_ORGANIZER', 'CONTROLLER'];

type AuthStatus = 'loading' | 'signedOut' | 'bootstrapError' | 'noScanAccess' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: UserSummary | null;
  organizationId: string | null;
  organizationName: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function findScanMembership(memberships: Membership[]): Membership | null {
  // Multi-org controllers are a known, unhandled edge case (see plan) — the
  // first qualifying active membership wins.
  return memberships.find((m) => m.status === 'ACTIVE' && SCAN_ROLES.includes(m.role)) ?? null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserSummary | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    setStatus('loading');
    const token = await getToken();
    if (!token) {
      setStatus('signedOut');
      return;
    }

    try {
      const me = await authApi.me();
      const membership = findScanMembership(me.memberships);
      setUser(me);
      if (!membership) {
        setOrganizationId(null);
        setOrganizationName(null);
        setStatus('noScanAccess');
        return;
      }
      setOrganizationId(membership.organization.id);
      setOrganizationName(membership.organization.name);
      setStatus('signedIn');
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 401) {
        await clearToken();
        setStatus('signedOut');
        return;
      }
      // Network/server error validating an existing token: keep the token,
      // let the user retry instead of forcing a re-login they don't need.
      setStatus('bootstrapError');
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    await setToken(response.accessToken);
    await bootstrap();
  }, [bootstrap]);

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
    setOrganizationId(null);
    setOrganizationName(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, user, organizationId, organizationName, login, logout, retryBootstrap: bootstrap }),
    [status, user, organizationId, organizationName, login, logout, bootstrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
