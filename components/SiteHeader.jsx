import Link from 'next/link'

export default function SiteHeader() {
  return (
    <header className="w-full z-10">
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3 group" style={{ minHeight: '36px' }}>
          {/* Logo will be added here when uploaded to /public/logo.svg */}
        </Link>
        <div className="ml-auto flex items-center gap-2 text-sm opacity-80">
          {/* Reserved for future actions (account, theme, etc.) */}
        </div>
      </div>
    </header>
  )
}
