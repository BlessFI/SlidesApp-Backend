export interface JwtPayload {
  sub: string;   // userId
  email: string;
  appId: string; // tenant – enforced on every request
  iat?: number;
  exp?: number;
}

export interface RegisterBody {
  email: string;
  password: string;
  appId: string; // tenant
  name?: string;
}

export interface LoginBody {
  email: string;
  password: string;
  appId: string; // tenant
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    appId: string;
    profileId: string;
    role: string | null;
    displayName: string | null;
  };
  token: string;
}
