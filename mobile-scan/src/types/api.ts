export type MemberRole = 'OWNER' | 'CO_ORGANIZER' | 'SELLER' | 'CONTROLLER' | 'ACCOUNTANT';
export type MemberStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
export type ScanResultCode = 'SUCCESS' | 'ALREADY_USED' | 'INVALID' | 'EXPIRED_EVENT';

export interface LoginResponse {
  accessToken: string;
  user: UserSummary;
}

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  isActive: boolean;
}

export interface Membership {
  id: string;
  role: MemberRole;
  status: MemberStatus;
  organization: {
    id: string;
    name: string;
    slug: string;
    isVerified: boolean;
  };
}

export interface MeResponse extends UserSummary {
  hasPassword: boolean;
  memberships: Membership[];
}

export interface EventSummary {
  id: string;
  name: string;
  status: EventStatus;
  startAt: string;
  endAt: string;
  venueName: string | null;
}

export interface ScanTicketResponse {
  result: ScanResultCode;
  ticket: {
    id: string;
    holderName: string | null;
    holderEmail: string | null;
    ticketTypeName: string;
  };
}

// Nest's default error shape (HttpExceptionFilter is dead code, never
// registered — see plan notes). message can be a string (most errors) or
// string[] (class-validator ValidationPipe failures).
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}
