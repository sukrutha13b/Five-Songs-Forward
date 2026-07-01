'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoginButton from '@/components/LoginButton';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    fetch('/api/spotify/user')
      .then((res) => {
        if (res.ok) router.push('/dashboard');
      })
      .catch(() => {});
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4">
      <div className="max-w-2xl text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-white sm:text-6xl">
          Five Songs <span className="text-[#1DB954]">Forward</span>
        </h1>
        <p className="mb-10 text-lg text-gray-400">
          Tell us where you&apos;re going. Drop 5 songs. We&apos;ll build the playlist.
        </p>
        <LoginButton />
      </div>
    </main>
  );
}
