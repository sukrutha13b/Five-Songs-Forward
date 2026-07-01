'use client';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-4">
      <h2 className="text-2xl font-bold text-white">Something went wrong</h2>
      <p className="text-gray-400">An unexpected error occurred. Please try again.</p>
      <button
        onClick={reset}
        className="rounded-full bg-[#1DB954] px-6 py-3 font-semibold text-black transition-colors hover:bg-[#1ed760]"
      >
        Try Again
      </button>
    </div>
  );
}
