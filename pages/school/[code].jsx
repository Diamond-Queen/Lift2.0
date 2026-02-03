export default function SchoolCodeRedirect() {
  // This page only exists for server-side redirect via getServerSideProps
  return null;
}

export async function getServerSideProps({ params }) {
  const code = params?.code || '';
  return {
    redirect: {
      destination: `/onboarding/school?code=${encodeURIComponent(code)}`,
      permanent: false,
    },
  };
}
