export type Role = 'owner' | 'editor' | 'viewer';
export type ShareRole = Exclude<Role, 'owner'>;

export interface User {
  id: number;
  email: string;
  name: string;
  color: string;
}

export type PublicUser = Pick<User, 'id' | 'name' | 'email' | 'color'>;

export interface DocumentSummary {
  id: string;
  title: string;
  role: Role;
  createdAt: number;
  updatedAt: number;
  owner: PublicUser;
}

export interface DocumentDetail extends DocumentSummary {
  content: string;
}

export interface ShareEntry {
  user: PublicUser;
  role: ShareRole;
  createdAt: number;
}

export interface SessionPayload {
  user: User;
}

export interface DocumentsResponse {
  owned: DocumentSummary[];
  shared: DocumentSummary[];
}

export interface ApiErrorBody {
  error: { message: string; code: string };
}
