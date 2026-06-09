import { useState } from 'react';
import './Auth.css';

export default function Auth({ onLogin, api }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const url = isLogin ? `${api}/auth/login` : `${api}/auth/signup`;
    const payload = isLogin 
      ? `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
      : JSON.stringify({ username, password });
    
    const headers = isLogin
      ? { 'Content-Type': 'application/x-www-form-urlencoded' }
      : { 'Content-Type': 'application/json' };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: payload
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || 'Authentication failed');
      }

      if (isLogin) {
        onLogin(data.access_token);
      } else {
        // Signup successful, log them in automatically
        const loginRes = await fetch(`${api}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
        });
        if (!loginRes.ok) throw new Error('Auto-login after signup failed');
        const loginData = await loginRes.json();
        onLogin(loginData.access_token);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Smrtayah</h1>
          <p className="auth-subtitle">Your AI Second Brain.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-toggle">
            <button
              type="button"
              className={isLogin ? 'active' : ''}
              onClick={() => { setIsLogin(true); setError(''); }}
            >
              Login
            </button>
            <button
              type="button"
              className={!isLogin ? 'active' : ''}
              onClick={() => { setIsLogin(false); setError(''); }}
            >
              Signup
            </button>
          </div>

          <div className="auth-input-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="off"
            />
          </div>

          <div className="auth-input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading || !username || !password}>
            {loading ? <div className="spin-auth" /> : isLogin ? 'Access Vault' : 'Create Vault'}
          </button>
        </form>
      </div>
    </div>
  );
}
