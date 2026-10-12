import {
  pgEnum, pgTable, uuid, varchar, text, integer, boolean, date, time,
  timestamp, numeric, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const userRoleEnum = pgEnum('user_role', ['SUPER_ADMIN', 'ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY', 'STUDENT']);
export const attendanceStatusEnum = pgEnum('attendance_status', ['PRESENT', 'ABSENT', 'LATE']);
export const noticePriorityEnum = pgEnum('notice_priority', ['LOW', 'NORMAL', 'HIGH', 'URGENT']);

export const departments = pgTable('departments', {
  id: uuid('id').defaultRandom().primaryKey(), code: varchar('code', { length: 12 }).notNull().unique(),
  name: varchar('name', { length: 160 }).notNull().unique(), active: boolean('active').default(true).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
});
export const courses = pgTable('courses', {
  id: uuid('id').defaultRandom().primaryKey(), departmentId: uuid('department_id').notNull().references(() => departments.id),
  name: varchar('name', { length: 120 }).notNull(), degree: varchar('degree', { length: 40 }).default('B.Tech').notNull(),
  durationYears: integer('duration_years').default(4).notNull(), active: boolean('active').default(true).notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('courses_dept_name_uq').on(t.departmentId, t.name)]);
export const academicYears = pgTable('academic_years', {
  id: uuid('id').defaultRandom().primaryKey(), label: varchar('label', { length: 20 }).notNull().unique(),
  startDate: date('start_date').notNull(), endDate: date('end_date').notNull(), active: boolean('active').default(false).notNull(), createdAt: createdAt(),
});
export const semesters = pgTable('semesters', {
  id: uuid('id').defaultRandom().primaryKey(), academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id),
  number: integer('number').notNull(), name: varchar('name', { length: 40 }).notNull(), startDate: date('start_date'), endDate: date('end_date'),
  active: boolean('active').default(false).notNull(), createdAt: createdAt(),
}, (t) => [uniqueIndex('semesters_year_number_uq').on(t.academicYearId, t.number)]);
export const sections = pgTable('sections', {
  id: uuid('id').defaultRandom().primaryKey(), departmentId: uuid('department_id').notNull().references(() => departments.id),
  courseId: uuid('course_id').references(() => courses.id), year: integer('year').notNull(), name: varchar('name', { length: 8 }).notNull(),
  academicYearId: uuid('academic_year_id').references(() => academicYears.id), active: boolean('active').default(true).notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('sections_dept_year_name_uq').on(t.departmentId, t.year, t.name)]);
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(), loginId: varchar('login_id', { length: 80 }).notNull().unique(),
  email: varchar('email', { length: 180 }).notNull().unique(), passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull(), fullName: varchar('full_name', { length: 140 }).notNull(), phone: varchar('phone', { length: 24 }),
  departmentId: uuid('department_id').references(() => departments.id), active: boolean('active').default(true).notNull(),
  isDemo: boolean('is_demo').default(false).notNull(), lastLoginAt: timestamp('last_login_at', { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('users_role_idx').on(t.role), index('users_department_idx').on(t.departmentId)]);
export const studentProfiles = pgTable('student_profiles', {
  id: uuid('id').defaultRandom().primaryKey(), userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  rollNumber: varchar('roll_number', { length: 32 }).notNull().unique(), departmentId: uuid('department_id').notNull().references(() => departments.id),
  courseId: uuid('course_id').references(() => courses.id), sectionId: uuid('section_id').notNull().references(() => sections.id),
  semesterId: uuid('semester_id').references(() => semesters.id), year: integer('year').notNull(), parentName: varchar('parent_name', { length: 140 }),
  parentPhone: varchar('parent_phone', { length: 24 }), admissionYear: integer('admission_year'), address: text('address'), active: boolean('active').default(true).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('students_dept_year_idx').on(t.departmentId, t.year), index('students_section_idx').on(t.sectionId)]);
export const facultyProfiles = pgTable('faculty_profiles', {
  id: uuid('id').defaultRandom().primaryKey(), userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  facultyCode: varchar('faculty_code', { length: 32 }).notNull().unique(), departmentId: uuid('department_id').notNull().references(() => departments.id),
  designation: varchar('designation', { length: 100 }).notNull(), active: boolean('active').default(true).notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const subjects = pgTable('subjects', {
  id: uuid('id').defaultRandom().primaryKey(), code: varchar('code', { length: 24 }).notNull().unique(), name: varchar('name', { length: 160 }).notNull(),
  departmentId: uuid('department_id').notNull().references(() => departments.id), semesterNumber: integer('semester_number').notNull(), credits: integer('credits').default(3).notNull(),
  active: boolean('active').default(true).notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const facultySubjects = pgTable('faculty_subjects', {
  id: uuid('id').defaultRandom().primaryKey(), facultyId: uuid('faculty_id').notNull().references(() => facultyProfiles.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id), sectionId: uuid('section_id').notNull().references(() => sections.id),
  semesterId: uuid('semester_id').references(() => semesters.id), academicYearId: uuid('academic_year_id').references(() => academicYears.id), createdAt: createdAt(),
}, (t) => [uniqueIndex('faculty_subject_section_uq').on(t.facultyId, t.subjectId, t.sectionId)]);
export const attendanceSessions = pgTable('attendance_sessions', {
  id: uuid('id').defaultRandom().primaryKey(), subjectId: uuid('subject_id').notNull().references(() => subjects.id),
  sectionId: uuid('section_id').notNull().references(() => sections.id), facultyId: uuid('faculty_id').notNull().references(() => facultyProfiles.id),
  classDate: date('class_date').notNull(), markedBy: uuid('marked_by').notNull().references(() => users.id),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('attendance_session_class_date_uq').on(t.subjectId, t.sectionId, t.classDate), index('attendance_date_idx').on(t.classDate)]);
export const attendanceRecords = pgTable('attendance_records', {
  id: uuid('id').defaultRandom().primaryKey(), sessionId: uuid('session_id').notNull().references(() => attendanceSessions.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => studentProfiles.id), status: attendanceStatusEnum('status').notNull(),
  markedBy: uuid('marked_by').notNull().references(() => users.id), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('attendance_session_student_uq').on(t.sessionId, t.studentId), index('attendance_student_idx').on(t.studentId)]);
export const notices = pgTable('notices', {
  id: uuid('id').defaultRandom().primaryKey(), title: varchar('title', { length: 180 }).notNull(), body: text('body').notNull(),
  audience: varchar('audience', { length: 24 }).default('ALL_STUDENTS').notNull(), departmentId: uuid('department_id').references(() => departments.id),
  year: integer('year'), sectionId: uuid('section_id').references(() => sections.id), priority: noticePriorityEnum('priority').default('NORMAL').notNull(),
  published: boolean('published').default(true).notNull(), publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }), createdBy: uuid('created_by').notNull().references(() => users.id), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(), recipientId: uuid('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 180 }).notNull(), message: text('message').notNull(), type: varchar('type', { length: 32 }).default('GENERAL').notNull(),
  status: varchar('status', { length: 20 }).default('IN_APP').notNull(), readAt: timestamp('read_at', { withTimezone: true }), metadata: jsonb('metadata'), createdAt: createdAt(),
}, (t) => [index('notification_recipient_created_idx').on(t.recipientId, t.createdAt)]);
export const timetables = pgTable('timetables', {
  id: uuid('id').defaultRandom().primaryKey(), sectionId: uuid('section_id').notNull().references(() => sections.id),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id), facultyId: uuid('faculty_id').notNull().references(() => facultyProfiles.id),
  dayOfWeek: integer('day_of_week').notNull(), startTime: time('start_time').notNull(), endTime: time('end_time').notNull(), room: varchar('room', { length: 32 }), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const examinations = pgTable('examinations', {
  id: uuid('id').defaultRandom().primaryKey(), name: varchar('name', { length: 140 }).notNull(), type: varchar('type', { length: 32 }).notNull(),
  departmentId: uuid('department_id').notNull().references(() => departments.id), year: integer('year').notNull(), sectionId: uuid('section_id').references(() => sections.id),
  subjectId: uuid('subject_id').references(() => subjects.id), examDate: date('exam_date').notNull(), startTime: time('start_time'), endTime: time('end_time'), room: varchar('room', { length: 32 }), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const marks = pgTable('marks', {
  id: uuid('id').defaultRandom().primaryKey(), examinationId: uuid('examination_id').notNull().references(() => examinations.id),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id), studentId: uuid('student_id').notNull().references(() => studentProfiles.id),
  internal: numeric('internal', { precision: 5, scale: 2 }).default('0').notNull(), external: numeric('external', { precision: 5, scale: 2 }).default('0').notNull(),
  maxMarks: numeric('max_marks', { precision: 5, scale: 2 }).default('100').notNull(), grade: varchar('grade', { length: 3 }), result: varchar('result', { length: 12 }), enteredBy: uuid('entered_by').references(() => users.id), reviewedAt: timestamp('reviewed_at', { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('marks_exam_subject_student_uq').on(t.examinationId, t.subjectId, t.studentId)]);
export const results = pgTable('results', {
  id: uuid('id').defaultRandom().primaryKey(), studentId: uuid('student_id').notNull().references(() => studentProfiles.id), examinationId: uuid('examination_id').notNull().references(() => examinations.id),
  cgpa: numeric('cgpa', { precision: 4, scale: 2 }), published: boolean('published').default(false).notNull(), publishedAt: timestamp('published_at', { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('results_student_exam_uq').on(t.studentId, t.examinationId)]);
export const fees = pgTable('fees', {
  id: uuid('id').defaultRandom().primaryKey(), studentId: uuid('student_id').notNull().references(() => studentProfiles.id), category: varchar('category', { length: 40 }).notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(), paidAmount: numeric('paid_amount', { precision: 10, scale: 2 }).default('0').notNull(), dueDate: date('due_date'), status: varchar('status', { length: 20 }).default('PENDING').notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const feePayments = pgTable('fee_payments', {
  id: uuid('id').defaultRandom().primaryKey(), feeId: uuid('fee_id').notNull().references(() => fees.id), amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  method: varchar('method', { length: 24 }).default('OFFLINE').notNull(), reference: varchar('reference', { length: 80 }), paidAt: timestamp('paid_at', { withTimezone: true }).defaultNow().notNull(), recordedBy: uuid('recorded_by').references(() => users.id),
});
export const smsCampaigns = pgTable('sms_campaigns', {
  id: uuid('id').defaultRandom().primaryKey(), name: varchar('name', { length: 160 }).notNull(), message: text('message').notNull(), audience: varchar('audience', { length: 32 }).notNull(),
  status: varchar('status', { length: 20 }).default('DRAFT').notNull(), scheduledAt: timestamp('scheduled_at', { withTimezone: true }), createdBy: uuid('created_by').notNull().references(() => users.id), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const smsRecipients = pgTable('sms_recipients', {
  id: uuid('id').defaultRandom().primaryKey(), campaignId: uuid('campaign_id').notNull().references(() => smsCampaigns.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id), phone: varchar('phone', { length: 24 }).notNull(), status: varchar('status', { length: 20 }).default('PENDING').notNull(), providerId: varchar('provider_id', { length: 100 }), createdAt: createdAt(),
});
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(), actorId: uuid('actor_id').references(() => users.id), action: varchar('action', { length: 80 }).notNull(),
  module: varchar('module', { length: 60 }).notNull(), recordId: varchar('record_id', { length: 80 }), oldValue: jsonb('old_value'), newValue: jsonb('new_value'), ip: varchar('ip', { length: 64 }), createdAt: createdAt(),
}, (t) => [index('audit_created_idx').on(t.createdAt), index('audit_actor_idx').on(t.actorId)]);
export const assignments = pgTable('assignments', {
  id: uuid('id').defaultRandom().primaryKey(), subjectId: uuid('subject_id').notNull().references(() => subjects.id), sectionId: uuid('section_id').notNull().references(() => sections.id),
  facultyId: uuid('faculty_id').notNull().references(() => facultyProfiles.id), title: varchar('title', { length: 180 }).notNull(), description: text('description'), dueAt: timestamp('due_at', { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(), title: varchar('title', { length: 180 }).notNull(), description: text('description'), startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  venue: varchar('venue', { length: 140 }), audience: varchar('audience', { length: 32 }).default('ALL').notNull(), createdBy: uuid('created_by').references(() => users.id), createdAt: createdAt(), updatedAt: updatedAt(),
});
