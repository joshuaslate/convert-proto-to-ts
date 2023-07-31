/**
 * DO NOT EDIT! Types generated from company_name/services/auth/v1/user.proto at 2023-07-31T04:06:00.672Z. */

import type { AuthV1Team } from './team';

export interface AuthV1ListUsersRequest {
    teamId?: string;
    page?: string;
}

export interface AuthV1ListUsersResponse {
    users?: AuthV1User[];
    nextPageCursor?: string;
}

export interface AuthV1User {
    id?: string;
    email?: string;
    // format: date-time
    createdAt?: string;
    // format: date-time
    updatedAt?: string;
    metadata?: Record<string, string>;
    isAdmin?: boolean;
    teams?: AuthV1Team[];
    role?: AuthV1Role;
    status?: 'STATUS_UNSPECIFIED' | 'STATUS_CLOSED' | 'STATUS_ACTIVE';
    profile?: {
        language?: string;
        timezone?: string;
        theme?: 'THEME_UNSPECIFIED' | 'THEME_DARK' | 'THEME_LIGHT';
    };
    // start oneof "permission"
    fullAccess?: boolean;
    scope?: string; // end oneof "permission"
}

export enum AuthV1Role {
    Unspecified = 'ROLE_UNSPECIFIED',
    Customer = 'ROLE_CUSTOMER',
    Admin = 'ROLE_ADMIN'
}

