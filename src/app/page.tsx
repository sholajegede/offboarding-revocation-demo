export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Offboarding Revocation Demo</h1>
      <p className="max-w-xl text-sm text-neutral-400">
        Console under construction. Sign in to get a session for testing the
        enforcement seam.
      </p>
      <a
        href="/api/auth/login"
        className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900"
      >
        Sign in
      </a>
    </main>
  );
}
