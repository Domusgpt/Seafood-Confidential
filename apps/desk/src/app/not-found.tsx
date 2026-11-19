import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="page page--narrow" tabIndex={-1}>
      <div className="page-header__text">
        <p className="eyebrow">Not found</p>
        <h1>That page is not here</h1>
        <p className="lede">It may have moved, or it may not be visible to your account.</p>
      </div>
      <p>
        <Link href="/">Back to Today</Link>
      </p>
    </main>
  );
}
