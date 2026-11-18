'use client';

// Route error boundary. Shows the digest (correlates with server logs) and never the error message,
// which could contain internal details.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="page page--narrow" tabIndex={-1}>
      <div className="page-header__text">
        <p className="eyebrow">Something went wrong</p>
        <h1>The desk could not finish that</h1>
        <p className="lede">
          Nothing was published or sent. Try again; if it keeps failing, share the reference below.
        </p>
      </div>
      {error.digest ? (
        <p>
          Reference: <code>{error.digest}</code>
        </p>
      ) : null}
      <div>
        <button type="button" className="button" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
