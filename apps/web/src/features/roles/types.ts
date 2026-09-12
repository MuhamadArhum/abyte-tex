export interface Permission {
  id: string;
  resource: string;
  action: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  _count?: { users: number };
}
