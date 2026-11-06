import type { UserRole } from '../context/AuthContext';

export type DashboardData = {
  role: UserRole; greeting: string; departmentId?: string | null;
  profile?: { rollNumber?: string; year?: number; section?: string; department?: string };
  stats: Array<{ label: string; value: string | number; tone?: 'good' | 'warning' | 'danger' | 'neutral' }>;
  todayClasses?: Array<{ subject: string; code: string; startTime?: string; room?: string }>;
  upcomingExams?: Array<{ name: string; subject?: string; date: string }>;
  notices?: Array<{ title: string; priority: string; publishedAt?: string }>;
};
export type ClassChoice = { subjectId: string; subjectCode: string; subjectName: string; sectionId: string; sectionName: string; year: number; departmentId: string; departmentName: string; departmentCode: string };
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE';
export type RegisterStudent = { id: string; userId: string; rollNumber: string; name: string; status: AttendanceStatus; attendancePercentage: number };
export type RegisterData = { classInfo: { subjectCode: string; subjectName: string; departmentName: string; departmentCode: string; year: number; sectionName: string }; facultyName: string; date: string; total: number; existingSession: boolean; sessionId: string | null; students: RegisterStudent[] };
export type StudentAttendance = { overall: { total: number; attended: number; absent: number; percentage: number }; subjects: Array<{ subjectId: string; subjectCode: string; subjectName: string; total: number; present: number; absent: number; late: number; attendancePercentage: number; history: Array<{ date: string; status: AttendanceStatus }> }> };
export type AttendanceAnalytics = { overall: { classes: number; records: number; percentage: number; threshold: number }; byYear: Array<{ name: string; total: number; percentage: number }>; bySection: Array<{ name: string; total: number; percentage: number }>; bySubject: Array<{ name: string; total: number; percentage: number }>; byDepartment: Array<{ name: string; total: number; percentage: number }>; lowAttendance: Array<{ id: string; name: string; roll: string; total: number; attended: number; department: string; percentage: number }> };
export type AttendanceHistoryItem = { id: string; date: string; subject: string; code: string; section: string; year: number; department: string; total: number; present: number; absent: number; late: number; percentage: number };
export type MobileNotification = { id: string; title: string; message: string; type: string; status: string; createdAt: string; readAt: string | null };
export type MobileNotice = { id: string; title: string; body: string; audience: string; priority: string; publishedAt: string; expiresAt?: string | null };
export type SectionChoice = { id: string; year: number; section: string; departmentId: string; department: string };
export type DepartmentChoice = { id: string; code: string; name: string };
