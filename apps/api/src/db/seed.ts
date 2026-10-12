import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { db, pool } from './client';
import { academicYears, assignments, attendanceRecords, attendanceSessions, courses, departments, events, examinations, facultyProfiles, facultySubjects, fees, notices, sections, semesters, studentProfiles, subjects, timetables, users } from './schema';

async function main() {
  const deptData = [
    ['CSE','Computer Science & Engineering'], ['ECE','Electronics & Communication Engineering'], ['CE','Civil Engineering'],
    ['ME','Mechanical Engineering'], ['EEE','Electrical & Electronics Engineering'], ['HS','Humanities & Science'],
  ];
  await db.insert(departments).values(deptData.map(([code,name])=>({code,name}))).onConflictDoNothing();
  const allDepts = await db.select().from(departments);
  const dept = (code:string) => { const found=allDepts.find(d=>d.code===code); if(!found) throw new Error(`Seed department missing: ${code}`); return found; };
  const cse = dept('CSE'), ece = dept('ECE');
  for (const d of allDepts) await db.insert(courses).values({ departmentId:d.id, name:'Bachelor of Technology', degree:'B.Tech', durationYears:4 }).onConflictDoNothing();
  const coursesData=await db.select().from(courses); const cseCourse=coursesData.find(c=>c.departmentId===cse.id)!;
  await db.insert(academicYears).values({label:'2026–27',startDate:'2026-06-01',endDate:'2027-05-31',active:true}).onConflictDoNothing();
  const [academicYear]=await db.select().from(academicYears).where(eq(academicYears.label,'2026–27')).limit(1);
  await db.insert(semesters).values({academicYearId:academicYear.id,number:5,name:'Semester V',startDate:'2026-06-01',endDate:'2026-11-30',active:true}).onConflictDoNothing();
  const [semester]=await db.select().from(semesters).where(and(eq(semesters.academicYearId,academicYear.id),eq(semesters.number,5))).limit(1);
  await db.insert(sections).values([
    {departmentId:cse.id,courseId:cseCourse.id,year:3,name:'A',academicYearId:academicYear.id},
    {departmentId:cse.id,courseId:cseCourse.id,year:3,name:'B',academicYearId:academicYear.id},
    {departmentId:ece.id,year:3,name:'A',academicYearId:academicYear.id},
  ]).onConflictDoNothing();
  const sectionRows=await db.select().from(sections); const cse3a=sectionRows.find(s=>s.departmentId===cse.id&&s.year===3&&s.name==='A')!;
  const passwords:Record<string,string>={
    'admin@demo.bits':'Admin@123','principal@demo.bits':'Principal@123','hod@demo.bits':'Hod@123','faculty@demo.bits':'Faculty@123','student@demo.bits':'Student@123',
  };
  const demoUsers=[
    {loginId:'admin@demo.bits',email:'admin@demo.bits',role:'ADMIN' as const,fullName:'Asha Demo Admin',departmentId:cse.id},
    {loginId:'principal@demo.bits',email:'principal@demo.bits',role:'PRINCIPAL' as const,fullName:'Dr. Kumar (Demo Principal)',departmentId:null},
    {loginId:'hod@demo.bits',email:'hod@demo.bits',role:'HOD' as const,fullName:'Prof. Ravi Kumar (Demo HOD)',departmentId:cse.id},
    {loginId:'faculty@demo.bits',email:'faculty@demo.bits',role:'FACULTY' as const,fullName:'Dr. Priya Reddy (Demo Faculty)',departmentId:cse.id},
    {loginId:'student@demo.bits',email:'student@demo.bits',role:'STUDENT' as const,fullName:'Rahul Kumar (Demo Student)',departmentId:cse.id},
  ];
  for(const item of demoUsers){
    const found=(await db.select({id:users.id}).from(users).where(eq(users.loginId,item.loginId)).limit(1))[0];
    if(!found) await db.insert(users).values({...item,passwordHash:await bcrypt.hash(passwords[item.loginId],12),isDemo:true}).onConflictDoNothing();
  }
  const [principal]=await db.select().from(users).where(eq(users.loginId,'principal@demo.bits')).limit(1);
  const userRows=await db.select().from(users); const userByLogin=(id:string)=>userRows.find(u=>u.loginId===id)!;
  const facultyUser=userByLogin('faculty@demo.bits'), hodUser=userByLogin('hod@demo.bits'), studentUser=userByLogin('student@demo.bits');
  await db.insert(facultyProfiles).values([
    {userId:facultyUser.id,facultyCode:'DEMO-FAC-001',departmentId:cse.id,designation:'Assistant Professor (Demo)'},
    {userId:hodUser.id,facultyCode:'DEMO-HOD-001',departmentId:cse.id,designation:'Professor · HOD (Demo)'},
  ]).onConflictDoNothing();
  const facultyRows=await db.select().from(facultyProfiles); const faculty=facultyRows.find(f=>f.userId===facultyUser.id)!;
  const subjectData=[
    {code:'CS501',name:'Database Management Systems',departmentId:cse.id,semesterNumber:5,credits:4},
    {code:'CS502',name:'Operating Systems',departmentId:cse.id,semesterNumber:5,credits:4},
    {code:'CS503',name:'Computer Networks',departmentId:cse.id,semesterNumber:5,credits:3},
    {code:'EC501',name:'Digital Signal Processing',departmentId:ece.id,semesterNumber:5,credits:4},
  ];
  await db.insert(subjects).values(subjectData).onConflictDoNothing();
  const subjectRows=await db.select().from(subjects); const dbms=subjectRows.find(s=>s.code==='CS501')!, os=subjectRows.find(s=>s.code==='CS502')!;
  await db.insert(facultySubjects).values([{facultyId:faculty.id,subjectId:dbms.id,sectionId:cse3a.id,semesterId:semester.id,academicYearId:academicYear.id},{facultyId:faculty.id,subjectId:os.id,sectionId:cse3a.id,semesterId:semester.id,academicYearId:academicYear.id}]).onConflictDoNothing();
  const students=[
    ['DEMO-CSE-001','Rahul Kumar (Demo Student)','student@demo.bits'],['DEMO-CSE-002','Priya Sharma','demo-cse-002@student.demo.bits'],['DEMO-CSE-003','Arjun Kumar','demo-cse-003@student.demo.bits'],['DEMO-CSE-004','Sneha Reddy','demo-cse-004@student.demo.bits'],
    ['DEMO-CSE-005','Kiran Kumar','demo-cse-005@student.demo.bits'],['DEMO-CSE-006','Ananya Rao','demo-cse-006@student.demo.bits'],['DEMO-CSE-007','Vikram Naidu','demo-cse-007@student.demo.bits'],['DEMO-CSE-008','Divya Prasad','demo-cse-008@student.demo.bits'],
    ['DEMO-CSE-009','Manoj Reddy','demo-cse-009@student.demo.bits'],['DEMO-CSE-010','Keerthi Nair','demo-cse-010@student.demo.bits'],['DEMO-CSE-011','Sandeep Varma','demo-cse-011@student.demo.bits'],['DEMO-CSE-012','Lakshmi Devi','demo-cse-012@student.demo.bits'],
  ];
  for(const [roll,name,loginId] of students){
    const found=(await db.select({id:users.id}).from(users).where(eq(users.loginId,loginId)).limit(1))[0];
    if(!found) await db.insert(users).values({loginId,email:loginId,passwordHash:await bcrypt.hash('Student@123',12),role:'STUDENT',fullName:name,phone:'+91 90000 10001',departmentId:cse.id,isDemo:true}).onConflictDoNothing();
  }
  const currentUsers=await db.select().from(users); const studentUsers=students.map(([roll,_name,loginId])=>({roll,user:currentUsers.find(u=>u.loginId===loginId)!}));
  for(const {roll,user} of studentUsers) await db.insert(studentProfiles).values({userId:user.id,rollNumber:roll,departmentId:cse.id,courseId:cseCourse.id,sectionId:cse3a.id,semesterId:semester.id,year:3,parentName:'Demo Parent',parentPhone:'+91 90000 20001',admissionYear:2024}).onConflictDoNothing();
  const profileRows=await db.select().from(studentProfiles); const cseStudents=profileRows.filter(s=>s.sectionId===cse3a.id).sort((a,b)=>a.rollNumber.localeCompare(b.rollNumber));
  const dates=['2026-09-28','2026-09-29','2026-09-30','2026-10-01'];
  for(let day=0;day<dates.length;day++){
    const [session]=await db.insert(attendanceSessions).values({subjectId:dbms.id,sectionId:cse3a.id,facultyId:faculty.id,classDate:dates[day],markedBy:facultyUser.id}).onConflictDoUpdate({target:[attendanceSessions.subjectId,attendanceSessions.sectionId,attendanceSessions.classDate],set:{updatedAt:new Date()}}).returning();
    const records=cseStudents.map((s,i)=>({sessionId:session.id,studentId:s.id,markedBy:facultyUser.id,status:(i===0?(['PRESENT','PRESENT','ABSENT','PRESENT'][day]):(i%7===0&&day===1?'ABSENT':'PRESENT')) as 'PRESENT'|'ABSENT'|'LATE'}));
    await db.insert(attendanceRecords).values(records).onConflictDoNothing();
  }
  for(const [dayOfWeek,startTime,endTime,subjectId,room] of [[1,'09:00','10:00',dbms.id,'A-301'],[1,'10:00','11:00',os.id,'A-301'],[3,'11:00','12:00',dbms.id,'A-301'],[5,'09:00','10:00',os.id,'A-301']] as const){
    const exists=await db.select({id:timetables.id}).from(timetables).where(and(eq(timetables.sectionId,cse3a.id),eq(timetables.subjectId,subjectId),eq(timetables.dayOfWeek,dayOfWeek),eq(timetables.startTime,startTime))).limit(1);
    if(!exists.length) await db.insert(timetables).values({sectionId:cse3a.id,subjectId,facultyId:faculty.id,dayOfWeek,startTime,endTime,room});
  }
  const examExists=await db.select({id:examinations.id}).from(examinations).where(eq(examinations.name,'Mid-Semester Examination · Semester V')).limit(1);
  if(!examExists.length) await db.insert(examinations).values({name:'Mid-Semester Examination · Semester V',type:'MID_EXAM',departmentId:cse.id,year:3,sectionId:cse3a.id,subjectId:dbms.id,examDate:'2026-10-18',startTime:'10:00',endTime:'13:00',room:'Examination Hall 1'});
  if(principal){
    const n=await db.select({id:notices.id}).from(notices).where(eq(notices.title,'Mid-semester examination schedule published')).limit(1);
    if(!n.length) await db.insert(notices).values({title:'Mid-semester examination schedule published',body:'The Semester V mid-semester examination schedule is available in the student portal. Please review the date and room for each paper.',audience:'ALL_STUDENTS',priority:'HIGH',published:true,createdBy:principal.id});
  }
  for(const student of cseStudents){
    const exists=await db.select({id:fees.id}).from(fees).where(and(eq(fees.studentId,student.id),eq(fees.category,'Semester V tuition fee'))).limit(1);
    if(!exists.length) await db.insert(fees).values({studentId:student.id,category:'Semester V tuition fee',amount:'42000',paidAmount:student.rollNumber.endsWith('001')?'32000':'42000',dueDate:'2026-10-30',status:student.rollNumber.endsWith('001')?'PARTIAL':'PAID'});
  }
  const task=await db.select({id:assignments.id}).from(assignments).where(eq(assignments.title,'Database normalization exercise')).limit(1);
  if(!task.length) await db.insert(assignments).values({subjectId:dbms.id,sectionId:cse3a.id,facultyId:faculty.id,title:'Database normalization exercise',description:'Normalize the provided transactional schema to 3NF and submit an ER diagram.',dueAt:new Date('2026-10-12T23:59:00+05:30')});
  const event=await db.select({id:events.id}).from(events).where(eq(events.title,'Engineering Project Showcase · Demo')).limit(1);
  if(!event.length) await db.insert(events).values({title:'Engineering Project Showcase · Demo',description:'A fictional sample campus event record for the development environment.',startsAt:new Date('2026-10-25T10:00:00+05:30'),venue:'Main Seminar Hall',audience:'ALL',createdBy:principal?.id});
  console.log(`Seed complete: ${allDepts.length} departments, ${cseStudents.length} CSE 3-A students, 5 role demo accounts, and 4 DBMS attendance dates.`);
  await pool.end();
}
main().catch(async(e)=>{console.error(e);await pool.end();process.exit(1)});
