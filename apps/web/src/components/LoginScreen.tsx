import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Brand } from './Brand';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

const demos = [
  { role: 'Student', id: 'student@demo.bits', password: 'Student@123', initials: 'ST', tone: 'blue' },
  { role: 'Faculty', id: 'faculty@demo.bits', password: 'Faculty@123', initials: 'FC', tone: 'cyan' },
  { role: 'HOD', id: 'hod@demo.bits', password: 'Hod@123', initials: 'HD', tone: 'violet' },
  { role: 'Principal', id: 'principal@demo.bits', password: 'Principal@123', initials: 'PR', tone: 'amber' },
  { role: 'Admin', id: 'admin@demo.bits', password: 'Admin@123', initials: 'AD', tone: 'slate' },
];

export function LoginScreen() {
  const { login } = useAuth();
  // Demo mode is decided by the API (DEMO_MODE, default: on outside production). Only then are the
  // fictional credentials pre-filled and listed; a real deployment shows an empty sign-in form.
  const [demoMode, setDemoMode] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api<{ demoMode: boolean }>('/auth/config')
      .then((config) => {
        if (!active || !config?.demoMode) return;
        setDemoMode(true);
        setIdentifier(demos[0].id);
        setPassword(demos[0].password);
      })
      .catch(() => { /* fail closed: no demo credentials are shown */ });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(identifier, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand-side">
        <div className="login-brand-content">
          <Brand />
          <div className="login-hero">
            <span className="login-overline">ACADEMIC OPERATIONS · CONNECTED</span>
            <h1>One campus.<br /><em>One connected</em><br />community.</h1>
            <p>Academic operations and student communication, designed for the people of BITS Kurnool.</p>
            <div className="login-address">
              <ShieldCheck size={17} />
              <span>NH-7, Peddatekur<br />Kurnool – 518218, Andhra Pradesh, India</span>
            </div>
          </div>
          <div className="login-brand-foot">
            <span>COLLEGE MANAGEMENT &amp; COMMUNICATION</span>
            <a href="https://www.bitskurnool.edu.in/" target="_blank" rel="noreferrer">bitskurnool.edu.in ↗</a>
          </div>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-box">
          <p className="eyebrow">{demoMode ? 'BITS KURNOOL · DEMO ACCESS' : 'BITS KURNOOL · SECURE SIGN-IN'}</p>
          <h2>Sign in to your portal</h2>
          <p className="login-subtitle">{demoMode ? 'Use a fictional demo identity to explore its role dashboard.' : 'Use your college account to continue.'}</p>
          <form onSubmit={submit}>
            <label>User ID / Roll number
              <div className="login-input">
                <span>@</span>
                <input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
              </div>
            </label>
            <label>Password
              <div className="login-input">
                <LockKeyhole size={17} />
                <input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                <button type="button" className="password-toggle" onClick={() => setShow(!show)} aria-label="Toggle password visibility">
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            <div className="login-helper">
              <span>Fictional demo environment</span>
              <button type="button" onClick={() => setError('Password recovery is not available yet. Contact the college system administrator to reset your password.')}>Forgot password?</button>
            </div>
            {error && <div className="inline-error">{error}</div>}
            <button className="button button-primary login-submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in to BITS Kurnool'}
              <ArrowRight size={16} />
            </button>
          </form>
          {demoMode ? <>
            <div className="demo-divider"><span>OR TRY A DEMO ROLE</span></div>
            <div className="demo-role-grid">
              {demos.map((demo) => (
                <button key={demo.role} className={`demo-role role-${demo.tone}`} onClick={() => {
                  setIdentifier(demo.id);
                  setPassword(demo.password);
                  setError('');
                }}>
                  <i>{demo.initials}</i><span>{demo.role}</span>
                </button>
              ))}
            </div>
            <div className="demo-disclosure">
              <strong>FICTIONAL DEMO ACCOUNTS</strong>
              <span>Names and academic records are sample data only. Demo credentials are public for evaluation; never enter real student or staff information here.</span>
            </div>
          </> : null}
        </div>
        <footer className="login-mobile-brand"><Brand compact short /></footer>
      </section>
    </main>
  );
}
