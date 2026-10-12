export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'PRINCIPAL' | 'HOD' | 'FACULTY' | 'STUDENT';
export interface SessionUser { id: string; loginId: string; fullName: string; role: UserRole; departmentId: string | null; isDemo: boolean }
export interface NavItem { label: string; icon: string; module?: string }
export interface ApiEnvelope<T> { success: boolean; data: T; message?: string }
export interface ClassChoice { subjectId: string; subjectCode: string; subjectName: string; sectionId: string; sectionName: string; year: number; departmentId: string; departmentName: string; departmentCode: string }
export interface RegisterStudent { id: string; userId: string; rollNumber: string; name: string; status: 'PRESENT' | 'ABSENT' | 'LATE'; attendancePercentage: number }
export interface RegisterData { classInfo: { subjectCode: string; subjectName: string; departmentName: string; departmentCode: string; year: number; sectionName: string }; facultyName: string; date: string; total: number; existingSession: boolean; students: RegisterStudent[] }
