export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'PRINCIPAL' | 'HOD' | 'FACULTY' | 'STUDENT';
export interface AuthUser {
  id: string;
  role: UserRole;
  departmentId: string | null;
  fullName: string;
  loginId: string;
  isDemo: boolean;
}
