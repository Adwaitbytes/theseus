import Link from "next/link";

export default function NotFound() {
  return (
    <section className="wrap flex min-h-[60vh] flex-col justify-center pt-16">
      <p className="t-num text-sm text-ink-3">404</p>
      <h1 className="t-h2 mt-4 max-w-xl">This plank is not on the ship.</h1>
      <p className="mt-6 max-w-lg text-ink-2">The page you asked for does not exist. The voyage, its certificate and the method are all one click away.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-quiet no-underline">
          Back to the voyage
        </Link>
        <Link href="/method" className="btn no-underline text-ink-2 hover:text-ink">
          Read the method
        </Link>
      </div>
    </section>
  );
}
