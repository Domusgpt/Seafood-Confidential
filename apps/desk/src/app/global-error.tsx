'use client';

import './tokens.css';
import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main id="main" className="page page--narrow">
          <h1>The desk is unavailable</h1>
          <p className="lede">Nothing was published or sent. Try again in a moment.</p>
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
      </body>
    </html>
  );
}
