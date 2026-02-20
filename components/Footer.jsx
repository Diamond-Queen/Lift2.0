import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Footer() {
  const router = useRouter();
  
  // Don't show global footer on pages that have their own footer content
  const pagesWithOwnFooter = ['/account', '/beta-signup', '/terms', '/privacy'];
  const shouldHideFooter = pagesWithOwnFooter.includes(router.pathname);
  
  if (shouldHideFooter) return null;

  const footerStyles = {
    footer: {
      marginTop: 'auto',
      padding: '1.5rem 1rem',
      borderTop: '1px solid #e0e0e0',
      background: '#f9f9f9',
      textAlign: 'center',
      fontSize: '0.9rem',
      color: '#666',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      alignItems: 'center',
    },
    contactEmail: {
      fontWeight: '600',
      color: '#8b7500',
      textDecoration: 'none',
    },
    links: {
      display: 'flex',
      gap: '1.5rem',
      justifyContent: 'center',
      flexWrap: 'wrap',
    },
    link: {
      color: '#666',
      textDecoration: 'none',
      fontSize: '0.85rem',
    },
    linkHover: {
      color: '#8b7500',
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
      <div style={{ fontSize: '0.8rem', color: '#999' }}>
        © 2025 Lift. All rights reserved.
      </div>
    </footer>
  );
}
