import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';

export default function Footer() {
  const router = useRouter();
  const [theme, setTheme] = useState(null);
  
  // Don't show global footer on pages that have their own footer content
  const pagesWithOwnFooter = ['/account', '/beta-signup', '/terms', '/privacy', '/notes', '/career'];
  const shouldHideFooter = pagesWithOwnFooter.includes(router.pathname);
  
  // Get theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
  }, []);
  
  if (shouldHideFooter) return null;

  // Dynamic footer styles based on current theme using CSS variables
  const footerStyles = {
    footer: {
      marginTop: 'auto',
      padding: '1.5rem 1rem',
      borderTop: '1px solid var(--card-border)',
      background: 'var(--card-bg)',
      textAlign: 'center',
      fontSize: '0.9rem',
      color: 'var(--text-color)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      alignItems: 'center',
    },
    contactEmail: {
      fontWeight: '600',
      color: 'var(--accent)',
      textDecoration: 'none',
    },
    links: {
      display: 'flex',
      gap: '1.5rem',
      justifyContent: 'center',
      flexWrap: 'wrap',
    },
    link: {
      color: 'var(--text-color)',
      textDecoration: 'none',
      fontSize: '0.85rem',
    },
    linkHover: {
      color: 'var(--accent)',
      textDecoration: 'underline',
    },
  };

  return (
    <footer style={footerStyles.footer}>
      <div>
        <strong>Need Help?</strong> Contact us at{' '}
        <a 
          href="mailto:williams.lift101@gmail.com" 
          style={footerStyles.contactEmail}
        >
          williams.lift101@gmail.com
        </a>
      </div>
      <div style={footerStyles.links}>
        <Link href="/terms" style={footerStyles.link} onMouseEnter={(e) => e.target.style.color = '#8b7500'} onMouseLeave={(e) => e.target.style.color = '#666'}>
          Terms of Service
        </Link>
        <Link href="/privacy" style={footerStyles.link} onMouseEnter={(e) => e.target.style.color = '#8b7500'} onMouseLeave={(e) => e.target.style.color = '#666'}>
          Privacy Policy
        </Link>
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
        © 2025 Lift. All rights reserved.
      </div>
    </footer>
  );
}
