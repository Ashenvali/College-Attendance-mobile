import { useEffect, useState } from 'react';
import { Bell, ChevronDown, Menu, Search, X } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { api } from './lib/api';
import { Sidebar, navForRole } from './components/Sidebar';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';
import { AttendanceRegister } from './components/AttendanceRegister';
import { StudentAttendance } from './components/StudentAttendance';
import { AttendanceAnalytics } from './components/AttendanceAnalytics';
import { NoticeBoard, NotificationCenter } from './components/CommunicationPages';
import { DataPage } from './components/DataPage';
import { SmsCampaignPage } from './components/SmsCampaignPage';
import { MarksPage } from './components/MarksPage';
import { Brand } from './components/Brand';
import type { NavItem } from './types';

export default function App(){const {user,loading,logout}=useAuth();const [active,setActive]=useState('Dashboard');const [mobileNav,setMobileNav]=useState(false);const [unread,setUnread]=useState(0);const [userMenu,setUserMenu]=useState(false);const [quickSearch,setQuickSearch]=useState('');
 useEffect(()=>{if(user){setActive('Dashboard');api<Array<{readAt:string|null}>>('/notifications').then(rows=>setUnread(rows.filter(r=>!r.readAt).length)).catch(()=>setUnread(0))}},[user?.id]);
 async function signOut(){await logout();setActive('Dashboard')}
 if(loading)return <div className="boot-screen"><Brand/><span>Connecting to the BITS Kurnool service…</span></div>;
 if(!user)return <LoginScreen/>;
 const nav=navForRole(user.role);const current=nav.find(n=>n.label===active)??nav[0];const dashboardProps={user,onNavigate:(p:string)=>{setActive(p);window.scrollTo({top:0,behavior:'smooth'})}};
 const moduleFor=(item:NavItem)=>item.module??item.label.toLowerCase().replaceAll(' ','-');
 let page:any;
 if(active==='Dashboard'||active==='Department Overview'||active==='Institution Overview')page=<Dashboard {...dashboardProps}/>;
 else if(active==='Attendance'&&user.role==='STUDENT')page=<StudentAttendance/>;
 else if(active==='Attendance Register'||(active==='Attendance'&&['FACULTY','ADMIN','SUPER_ADMIN'].includes(user.role)))page=<AttendanceRegister onSaved={()=>api<Array<{readAt:string|null}>>('/notifications').then(r=>setUnread(r.filter(n=>!n.readAt).length)).catch(()=>undefined)}/>;
 else if(active==='Attendance Analytics'||active==='Analytics'||active==='Attendance')page=<AttendanceAnalytics/>;
 else if(active==='Notices'||active==='Class Notices'||active==='Communication')page=<NoticeBoard user={user}/>;
 else if(active==='Notifications')page=<NotificationCenter/>;
 else if(active==='Profile')page=<Profile user={user}/>;
 else if(active==='Help')page=<section className="panel help-card"><p className="eyebrow">STUDENT SUPPORT</p><h2>How can we help?</h2><p>For academic or account support, contact the BITS Kurnool college office using the official contact details published on the college website.</p><a className="button button-primary" href="https://www.bitskurnool.edu.in/" target="_blank" rel="noreferrer">Visit official college website</a></section>;
 else if(active==='Settings')page=<section className="panel settings-panel"><p className="eyebrow">SYSTEM CONFIGURATION</p><h2>Development settings</h2><p>Attendance alerts use a configurable 75% threshold. SMS and push providers remain in mock/off mode unless production credentials are added to the server environment.</p><div className="settings-row"><span>Attendance warning threshold</span><strong>75%</strong></div><div className="settings-row"><span>SMS provider</span><strong>Mock mode</strong></div><div className="settings-row"><span>Push notification service</span><strong>Not configured</strong></div></section>;
 else if(active==='Attendance History')page=<DataPage resource="attendance-history" role={user.role}/>;
 else if(active==='Marks')page=<MarksPage user={user}/>;
 else if(active==='SMS')page=<SmsCampaignPage/>;
 else page=<DataPage resource={moduleFor(current)} role={user.role}/>;
 const title=active==='Attendance Register'?'Attendance register':active==='Attendance Analytics'?'Department attendance analytics':active==='Attendance'?'Attendance':active;
 const bottom=nav.slice(0,4);
 return <div className="app-shell"><Sidebar user={user} active={active} onSelect={(item)=>{setActive(item.label);setQuickSearch('')}} onLogout={signOut} open={mobileNav} onClose={()=>setMobileNav(false)}/><main className="main-area"><header className="topbar"><button className="mobile-menu icon-button" onClick={()=>setMobileNav(true)} aria-label="Open navigation"><Menu size={19}/></button><div className="topbar-brand"><Brand compact/></div><div className="breadcrumbs"><span>BITS Kurnool</span><i>/</i><strong>{title}</strong></div><div className="topbar-actions"><label className="top-search"><Search size={15}/><input placeholder="Search this workspace" value={quickSearch} onChange={e=>setQuickSearch(e.target.value)}/><kbd>⌘ K</kbd></label><button className="icon-button notification-button" aria-label="Notifications" onClick={()=>{const target=nav.find(n=>n.label==='Notifications');if(target)setActive(target.label)}}><Bell size={18}/>{unread>0&&<i>{unread>9?'9+':unread}</i>}</button><div className="profile-menu-wrap"><button className="profile-menu" onClick={()=>setUserMenu(!userMenu)}><span className="user-avatar">{user.fullName.split(' ').map(x=>x[0]).slice(0,2).join('')}</span><span className="profile-menu-copy"><strong>{user.fullName.split(' (')[0]}</strong><small>{user.role.replaceAll('_',' ')}</small></span><ChevronDown size={14}/></button>{userMenu&&<div className="profile-dropdown"><div><strong>{user.loginId}</strong><small>DEVELOPMENT DEMO</small></div><button onClick={()=>{setActive('Profile');setUserMenu(false)}}>My profile</button><button className="dropdown-logout" onClick={signOut}>Sign out</button></div>}</div></div></header><div className="content-wrap"><div className="page-title-row"><div><div className="breadcrumb-mobile"><span>College portal</span><i>/</i>{title}</div><h1>{title}</h1><p>{user.role==='STUDENT'?'Your academics, attendance, and college updates.':user.role==='FACULTY'?'Classroom operations and student academic records.':user.role==='HOD'?'Department oversight, student progress, and faculty activity.':user.role==='PRINCIPAL'?'Institution-wide academic and communication overview.':'Administrative management for BITS Kurnool.'}</p></div><span className="date-badge desktop-date">Academic year 2026–27</span></div>{quickSearch&&<div className="search-hint">Search is active in the current list for “{quickSearch}”. Clear to return to the full view.</div>}{page}</div><footer className="app-footer"><span>Brindavan Institute of Technology &amp; Science · BITS Kurnool</span><span>DEVELOPMENT DEMO DATA · NH-7, Peddatekur, Kurnool</span></footer><nav className="mobile-bottom-nav">{bottom.map(item=><button key={item.label} className={active===item.label?'active':''} onClick={()=>setActive(item.label)}><span>{item.icon==='Dashboard'?'⌂':item.icon==='Attendance'?'✓':item.icon==='Timetable'?'◷':'•'}</span>{item.label}</button>)}</nav></main></div>;
}
function Profile({user}:{user:{fullName:string;loginId:string;role:string;isDemo:boolean}}){return <section className="panel profile-card"><div className="profile-cover"><span className="profile-large-avatar">{user.fullName.split(' ').map(x=>x[0]).slice(0,2).join('')}</span></div><p className="eyebrow">ACCOUNT PROFILE</p><h2>{user.fullName}</h2><p>{user.role.replaceAll('_',' ')} · {user.isDemo?'Fictional development account':'College account'}</p><div className="profile-detail-grid"><div><small>Login ID</small><strong>{user.loginId}</strong></div><div><small>Institution</small><strong>Brindavan Institute of Technology &amp; Science</strong></div><div><small>Campus</small><strong>Peddatekur, Kurnool – 518218</strong></div><div><small>Account type</small><strong>{user.isDemo?'DEVELOPMENT DEMO':'Authenticated user'}</strong></div></div><a href="https://www.bitskurnool.edu.in/" target="_blank" rel="noreferrer">Official college website ↗</a></section>}
