import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { getCurrencyByCountryCode } from '../utils/countries';
import { detectCountryCode } from '../utils/geo';
import CountryPicker from './CountryPicker';
import PurposePicker from './PurposePicker';

function useOtpTimer(seconds = 60) {
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef(null);
  const start = useCallback(() => {
    setRemaining(seconds);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setRemaining(prev => { if (prev <= 1) { clearInterval(intervalRef.current); return 0; } return prev - 1; });
    }, 1000);
  }, [seconds]);
  const reset = useCallback(() => { if (intervalRef.current) clearInterval(intervalRef.current); setRemaining(0); }, []);
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);
  return { remaining, start, reset, active: remaining > 0 };
}

export default function AuthPage() {
  const { login, register, user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regStep, setRegStep] = useState(1);
  const [regEmail, setRegEmail] = useState('');
  const [regOTP, setRegOTP] = useState('');
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPurpose, setRegPurpose] = useState('');
  const [regCountryCode, setRegCountryCode] = useState('+966');
  const [regPhone, setRegPhone] = useState('');
  const [devOTP, setDevOTP] = useState('');

  const [fpEmail, setFpEmail] = useState('');
  const [fpOTP, setFpOTP] = useState('');
  const [fpNewPassword, setFpNewPassword] = useState('');
  const [fpStep, setFpStep] = useState(1);
  const [fpDevOTP, setFpDevOTP] = useState('');

  const regTimer = useOtpTimer(60);
  const fpTimer = useOtpTimer(60);
  const selectedCountry = getCurrencyByCountryCode(regCountryCode);

  useEffect(() => { detectCountryCode().then(code => setRegCountryCode(code)); }, []);

  const handleLogin = async (e) => {
    e.preventDefault(); setError('');
    if (!loginId || !loginPassword) { setError('All fields are required'); return; }
    setLoading(true);
    try { await login(loginId, loginPassword); } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleSendRegOTP = async () => {
    if (!regEmail || !regEmail.includes('@')) { setError('Enter a valid email address'); return; }
    setError(''); setLoading(true); setDevOTP('');
    try {
      const res = await api.post('/auth/send-otp', { target: regEmail, purpose: 'register' }, { timeout: 60000 });
      setLoading(false);
      if (res.code) setDevOTP(res.code);
      setRegStep(2); regTimer.start();
    } catch (err) { setError(err.message); setLoading(false); }
  };

  const handleVerifyRegOTP = async () => {
    if (!regOTP || regOTP.length !== 6) { setError('Enter the 6-digit OTP'); return; }
    setError(''); setLoading(true);
    try {
      await api.post('/auth/verify-otp', { target: regEmail, code: regOTP, purpose: 'register' });
      regTimer.reset(); setLoading(false); setRegStep(3);
    } catch (err) { setError(err.message); setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault(); setError('');
    if (!regName) { setError('Name is required'); return; }
    if (!regPassword || regPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!regPurpose) { setError('Please select a purpose'); return; }
    setLoading(true);
    try {
      const phone = regPhone ? regCountryCode + regPhone : '';
      await register(regName, regEmail, phone, regPassword, regPurpose, regCountryCode, selectedCountry.name, selectedCountry.currency);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleForgotPasswordSendOTP = async () => {
    if (!fpEmail || !fpEmail.includes('@')) { setError('Enter your registered email address'); return; }
    setError(''); setLoading(true); setFpDevOTP('');
    try {
      const res = await api.post('/auth/forgot-password', { target: fpEmail, method: 'email' }, { timeout: 60000 });
      setLoading(false);
      if (res.code) setFpDevOTP(res.code);
      setFpStep(2); fpTimer.start();
    } catch (err) { setError(err.message); setLoading(false); }
  };

  const handleVerifyFPOtp = async () => {
    if (!fpOTP || fpOTP.length !== 6) { setError('Enter the 6-digit OTP'); return; }
    setError(''); setLoading(true);
    try {
      await api.post('/auth/verify-otp', { target: fpEmail, code: fpOTP, purpose: 'reset_password' });
      fpTimer.reset(); setLoading(false); setFpStep(3);
    } catch (err) { setError(err.message); setLoading(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault(); setError('');
    if (!fpNewPassword || fpNewPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { identifier: fpEmail, code: fpOTP, newPassword: fpNewPassword });
      setView('login'); setFpStep(1); setFpEmail(''); setFpOTP(''); setFpNewPassword('');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const resetRegistration = () => {
    setRegStep(1); setRegEmail(''); setRegOTP(''); setRegPhone(''); setDevOTP('');
    regTimer.reset(); setError('');
  };

  const inputStyle = { width: '100%', padding: '14px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box', transition: 'all 0.3s', outline: 'none', letterSpacing: '0.2px' };
  const labelStyle = { fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px', display: 'block' };

  const ErrorBanner = () => error ? (
    <div style={{ color: '#ff6b6b', marginBottom: 16, fontSize: 13, padding: '12px 16px', background: 'rgba(255, 107, 107, 0.06)', borderRadius: 12, border: '1px solid rgba(255, 107, 107, 0.1)', fontWeight: 500 }}>{error}</div>
  ) : null;

  const LogoHeader = () => (
    <div className="auth-logo-header">
      <img src="/logo-full.svg" alt="Ledgerly" className="auth-logo" />
    </div>
  );

  const ResendButton = ({ onResend, timer }) => (
    <div style={{ textAlign: 'center', marginTop: 12 }}>
      {timer.active ? (
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>
          Resend in <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{timer.remaining}s</span>
        </span>
      ) : (
        <a onClick={onResend} style={{ color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', fontWeight: 600, textDecoration: 'none' }}>Resend OTP</a>
      )}
    </div>
  );

  const StepIndicator = ({ current, total }) => (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 24 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ height: 3, borderRadius: 2, flex: 1, background: i < current ? 'linear-gradient(90deg, #1B2559, #2E3A6E)' : 'var(--border)', transition: 'all 0.4s' }} />
      ))}
    </div>
  );

  const focusStyle = { borderColor: 'var(--accent-light)', background: 'var(--bg-input-focus)' };
  const blurStyle = { borderColor: 'var(--border)', background: 'var(--bg-input)' };
  const handleFocus = (e) => { Object.assign(e.target.style, focusStyle); };
  const handleBlur = (e) => { Object.assign(e.target.style, blurStyle); };

  return (
    <div className="auth-container">
      <div className="auth-bg-orb auth-bg-orb-1"></div>
      <div className="auth-bg-orb auth-bg-orb-2"></div>
      <div className="auth-bg-lines"></div>
      <div className="auth-card">
        <LogoHeader />

        {view === 'login' && (
          <>
            <div className="auth-welcome">
              <h3>Welcome back</h3>
              <p>Sign in to manage your expenses</p>
            </div>
            <ErrorBanner />
            <form onSubmit={handleLogin} style={{ textAlign: 'left' }}>
              <div className="input-group">
                <label style={labelStyle}>Email</label>
                <input type="email" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="you@example.com" required style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} />
              </div>
              <div className="input-group">
                <label style={labelStyle}>Password</label>
                <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Enter your password" required style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} />
              </div>
              <button className="auth-btn-primary" disabled={loading}>
                {loading ? <span className="auth-btn-loader"></span> : 'Sign In'}
              </button>
            </form>
            <a onClick={() => { setView('forgot_password'); setFpStep(1); setError(''); setFpEmail(''); }} className="auth-forgot-link">Forgot password?</a>
            <div className="auth-bottom-section">
              <p className="auth-switch-text">Don't have an account?</p>
              <button className="auth-btn-secondary" onClick={() => { setView('register'); resetRegistration(); }}>Create Account</button>
              <a onClick={() => { localStorage.setItem('guest', '1'); navigate('/'); }} className="auth-guest-link">Continue as guest</a>
            </div>
          </>
        )}

        {view === 'register' && regStep === 1 && (
          <>
            <StepIndicator current={0} total={3} />
            <div className="auth-welcome">
              <h3>Create your account</h3>
              <p>Enter your email to get started</p>
            </div>
            <ErrorBanner />
            <form onSubmit={(e) => { e.preventDefault(); handleSendRegOTP(); }} style={{ textAlign: 'left' }}>
              <div className="input-group">
                <label style={labelStyle}>Email Address</label>
                <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="you@example.com" required style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} />
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>We'll send a verification code to this email</div>
              </div>
              <button className="auth-btn-primary" disabled={loading}>
                {loading ? <span className="auth-btn-loader"></span> : 'Send Verification Code'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <a onClick={() => { setView('login'); setError(''); }} className="auth-back-link">Already have an account? Sign In</a>
            </div>
          </>
        )}

        {view === 'register' && regStep === 2 && (
          <>
            <StepIndicator current={1} total={3} />
            <div className="auth-welcome">
              <h3>Verify your email</h3>
              <p>We sent a 6-digit code to<br/><strong style={{ color: 'var(--text-primary)' }}>{regEmail}</strong></p>
            </div>
            {devOTP && (
              <div style={{ marginBottom: 16, padding: '16px', background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Your verification code</p>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 10, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{devOTP}</div>
              </div>
            )}
            <ErrorBanner />
            <form onSubmit={(e) => { e.preventDefault(); handleVerifyRegOTP(); }} style={{ textAlign: 'left' }}>
              <div className="input-group">
                <input type="text" inputMode="numeric" value={regOTP} onChange={(e) => setRegOTP(e.target.value.replace(/\D/g, ''))} placeholder="000000" maxLength={6} required style={{ ...inputStyle, textAlign: 'center', fontSize: 28, letterSpacing: 12, fontWeight: 700, padding: '18px 16px' }} />
              </div>
              <button className="auth-btn-primary" disabled={loading}>
                {loading ? <span className="auth-btn-loader"></span> : 'Verify Code'}
              </button>
            </form>
            <ResendButton onResend={handleSendRegOTP} timer={regTimer} />
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <a onClick={() => { setRegStep(1); setError(''); setRegOTP(''); setDevOTP(''); regTimer.reset(); }} className="auth-back-link">Change email</a>
            </div>
          </>
        )}

        {view === 'register' && regStep === 3 && (
          <>
            <StepIndicator current={2} total={3} />
            <div className="auth-welcome">
              <h3>Complete your profile</h3>
              <p>Tell us a bit about yourself</p>
            </div>
            <ErrorBanner />
            <form onSubmit={handleRegister} style={{ textAlign: 'left' }}>
              <div className="input-group">
                <label style={labelStyle}>Full Name</label>
                <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Your full name" required style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} />
              </div>
              <div className="input-group">
                <label style={labelStyle}>Password</label>
                <input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Min. 6 characters" required style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} />
              </div>
              <div className="input-group">
                <label style={labelStyle}>Phone Number <span style={{ fontWeight: 400, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional, sets your currency)</span></label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <CountryPicker value={regCountryCode} onChange={setRegCountryCode} />
                  <input type="tel" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder="5X XXX XXXX" style={{ ...inputStyle, flex: 1 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 14 }}>{selectedCountry.flag}</span>
                  <span>Country: {selectedCountry.name} &middot; Currency: {selectedCountry.currency} ({selectedCountry.symbol})</span>
                </div>
              </div>
              <div className="input-group">
                <label style={labelStyle}>Purpose</label>
                <PurposePicker value={regPurpose} onChange={setRegPurpose} />
              </div>
              <div className="auth-currency-badge">
                {selectedCountry.flag} All amounts in <strong>{selectedCountry.currency}</strong> ({selectedCountry.symbol})
              </div>
              <button className="auth-btn-primary" disabled={loading}>
                {loading ? <span className="auth-btn-loader"></span> : 'Create Account'}
              </button>
            </form>
          </>
        )}

        {view === 'forgot_password' && fpStep === 1 && (
          <>
            <div className="auth-welcome"><h3>Reset password</h3><p>Enter your registered email</p></div>
            <ErrorBanner />
            <form onSubmit={(e) => { e.preventDefault(); handleForgotPasswordSendOTP(); }} style={{ textAlign: 'left' }}>
              <div className="input-group">
                <label style={labelStyle}>Email Address</label>
                <input type="email" value={fpEmail} onChange={(e) => setFpEmail(e.target.value)} placeholder="you@example.com" required style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} />
              </div>
              <button className="auth-btn-primary" disabled={loading}>{loading ? <span className="auth-btn-loader"></span> : 'Send Verification Code'}</button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 16 }}><a onClick={() => { setView('login'); setError(''); }} className="auth-back-link">Back to Sign In</a></div>
          </>
        )}

        {view === 'forgot_password' && fpStep === 2 && (
          <>
            <div className="auth-welcome"><h3>Enter verification code</h3><p>Code sent to <strong style={{ color: 'var(--text-primary)' }}>{fpEmail}</strong></p></div>
            {fpDevOTP && (
              <div style={{ marginBottom: 16, padding: '16px', background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Your verification code</p>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 10, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{fpDevOTP}</div>
              </div>
            )}
            <ErrorBanner />
            <form onSubmit={(e) => { e.preventDefault(); handleVerifyFPOtp(); }} style={{ textAlign: 'left' }}>
              <div className="input-group">
                <input type="text" inputMode="numeric" value={fpOTP} onChange={(e) => setFpOTP(e.target.value.replace(/\D/g, ''))} placeholder="000000" maxLength={6} required style={{ ...inputStyle, textAlign: 'center', fontSize: 28, letterSpacing: 12, fontWeight: 700, padding: '18px 16px' }} />
              </div>
              <button className="auth-btn-primary" disabled={loading}>{loading ? <span className="auth-btn-loader"></span> : 'Verify Code'}</button>
            </form>
            <ResendButton onResend={handleForgotPasswordSendOTP} timer={fpTimer} />
          </>
        )}

        {view === 'forgot_password' && fpStep === 3 && (
          <>
            <div className="auth-welcome"><h3>New password</h3><p>Choose a strong password</p></div>
            <ErrorBanner />
            <form onSubmit={handleResetPassword} style={{ textAlign: 'left' }}>
              <div className="input-group">
                <label style={labelStyle}>New Password</label>
                <input type="password" value={fpNewPassword} onChange={(e) => setFpNewPassword(e.target.value)} placeholder="Min. 6 characters" required style={inputStyle} onFocus={handleFocus} onBlur={handleBlur} />
              </div>
              <button className="auth-btn-primary" disabled={loading}>{loading ? <span className="auth-btn-loader"></span> : 'Update Password'}</button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 16 }}><a onClick={() => { setView('login'); setFpStep(1); setError(''); }} className="auth-back-link">Back to Sign In</a></div>
          </>
        )}

        <div className="auth-footer-text"><p>&copy; 2026 Sovereign Technologies, Inc.</p></div>
      </div>
    </div>
  );
}
