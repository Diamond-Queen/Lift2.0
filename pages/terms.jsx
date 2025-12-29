import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

export default function TermsOfService() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMarkdown = async () => {
      try {
        const res = await fetch('/markdown/terms.md');
        const text = await res.text();
        setContent(text);
      } catch (error) {
        console.error('Failed to load terms:', error);
        setContent('# Terms of Service\n\nFailed to load content. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    loadMarkdown();
  }, []);

  if (loading) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px', minHeight: '100vh' }}>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px', minHeight: '100vh' }}>
      <button
        onClick={() => window.history.back()}
        style={{
          marginBottom: '20px',
          padding: '8px 16px',
          backgroundColor: 'var(--primary-color)',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        ← Back
      </button>
      <div
        style={{
          fontSize: '0.95em',
          lineHeight: '1.6',
          color: 'var(--text-color)',
        }}
      >
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
