import '../styles/globals.css'
import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import { SessionProvider, useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import ShootingStars from '../components/ShootingStars'
import SiteHeader from '../components/SiteHeader'

export default function App({ Component, pageProps }) {
  // Load theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // Reset study override on route changes; study pages will re-enable explicitly
  const router = useRouter();
  useEffect(() => {
    const handleRouteStart = () => {
      try { document.documentElement.dataset.study = 'off'; } catch(e) {}
    };
    router.events.on('routeChangeStart', handleRouteStart);
    return () => {
      router.events.off('routeChangeStart', handleRouteStart);
    };
  }, [router]);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b0b0b" />
      </Head>
      <SessionProvider session={pageProps.session}>
        {/* Global shooting stars overlay */}
        <ShootingStars />
        {/* Top header with logo */}
        <SiteHeader />
        {/* Global Home button (fixed) - route based on auth state */}
        <HomeFab />
        <Component {...pageProps} />
      </SessionProvider>
    </>
  )
}

function HomeFab() {
  const { status } = useSession();
  const router = useRouter();
  const handleClick = (e) => {
    e.preventDefault();
    if (status === 'authenticated') {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  };
  return (
    <a href="#" className="homeFab" aria-label="Home" onClick={handleClick}>
      <Image src="/logo.png" alt="Home" width={48} height={48} style={{ display: 'block', objectFit: 'cover', borderRadius: '50%' }} />
    </a>
  );
}
