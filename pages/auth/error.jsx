import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function AuthError() {
  const router = useRouter();
  const { error } = router.query;

  useEffect(() => {
    // Auto-redirect to login after 2 seconds
    const timer = setTimeout(() => {
      router.push('/login');
    }, 2000);
    return () => clearTimeout(timer);
  }, [router]);

  const errorMessages = {
    Callback: 'There was an issue with your account. Please try logging in again.',
    OAuthSignin: 'Could not sign in with your OAuth provider. Please try again.',
    OAuthCallback: 'There was an issue with your OAuth callback. Please try again.',
    EmailCreateAccount: 'Could not create account with that email.',
    Callback: 'Your account has an issue. Please contact support if this persists.',
    EmailSignInError: 'Email sign in failed. Please try again.',
    SessionCallback: 'Session error. Please log in again.',
    CredentialsSignin: 'Sign in failed. Invalid email or password.',
    default: 'An authentication error occurred. Redirecting to login...',
  };

  const message = errorMessages[error] || errorMessages.default;

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '20px',
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        maxWidth: '500px',
        textAlign: 'center',
      }}>
        <h1 style={{ color: '#dc3545', marginBottom: '20px' }}>Authentication Error</h1>
        <p style={{ fontSize: '16px', color: '#666', marginBottom: '20px' }}>
          {message}
        </p>
        {error && (
          <p style={{ fontSize: '12px', color: '#999', marginTop: '20px' }}>
            Error code: {error}
          </p>
        )}
        <p style={{ fontSize: '14px', color: '#999', marginTop: '20px' }}>
          Redirecting to login...
        </p>
      </div>
    </div>
  );
}
