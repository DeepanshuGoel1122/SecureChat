import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    
    try {
      const response = await fetch(`https://securechat-u1nk.onrender.com${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }
      
      login(data.token, data.user);
      
      if (data.user?.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      
      <div style={{ textAlign: 'center', width: '100%', maxWidth: '400px' }}>
        <h1 style={{ 
          fontSize: '2.5rem', 
          marginBottom: '1rem', 
          background: 'linear-gradient(to right, #58a6ff, #a371f7)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontWeight: 800
        }}>
          SecureChat
        </h1>
        <div className="glass-panel auth-box" style={{ margin: '0 auto' }}>
          <h2 className="auth-title" style={{ fontSize: '1.5rem', marginBottom: '1.5rem', background: 'none', WebkitTextFillColor: 'var(--text-primary)' }}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          
          {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}
          
          <form onSubmit={handleSubmit}>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Username" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required 
            />
            <input 
              type="password" 
              className="input-field" 
              placeholder="Password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
            <button type="submit" className="btn" style={{ width: '100%', marginTop: '1rem' }}>
              {isLogin ? 'Login' : 'Register'}
            </button>
          </form>
          
          <div className="auth-link">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <span onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? 'Sign up' : 'Sign in'}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}

export default Login;
