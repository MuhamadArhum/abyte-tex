export type UserStatus = "ACTIVE" | "INACTIVE" | "INVITED" | "LOCKED";

export interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  roles: Array<{ role: { id: string; code: string; name: string } }>;
  factoryAccess: Array<{ factory: { id: string; name: string; code: string } }>;
}

export interface InviteUserInput {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roleIds: string[];
  factoryIds?: string[];
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  status?: UserStatus;
  roleIds?: string[];
  factoryIds?: string[];
}
