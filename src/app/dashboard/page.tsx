'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { useSeeds } from '@/hooks/useSeeds';
import SeedInput from '@/components/SeedInput';
import GenerateButton from '@/components/GenerateButton';
import PlaylistResult from '@/components/PlaylistResult';
import { GeneratedPlaylist } from '@/lib/types';

type Phase = 'input' | 'generating' | 'result';

export default function Dashboard() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { seeds, addSeed, removeSeed, canGenerate, clearSeeds } = useSeeds();
  const [phase, setPhase] = useState<Phase>('input');
  const [playlist, setPlaylist] = useState<GeneratedPlaylist | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#1DB954]" />
      </div>
    );
  }

  if (!user) return null;

  const handleResult = (result: GeneratedPlaylist) => {
    setPlaylist(result);
    setPhase('result');
  };

  const handleStartOver = () => {
    setPlaylist(null);
    setPhase('input');
    clearSeeds();
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Five Songs <span className="text-[#1DB954]">Forward</span>
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{user.displayName}</span>
          {user.imageUrl && (
            <Image
              src={user.imageUrl}
              alt={user.displayName}
              width={32}
              height={32}
              className="rounded-full"
            />
          )}
          <a
            href="/api/auth/logout"
            className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            Log out
          </a>
        </div>
      </div>

      {/* Content */}
      {phase === 'result' && playlist ? (
        <PlaylistResult playlist={playlist} onStartOver={handleStartOver} />
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="mb-2 text-xl font-semibold">
              {phase === 'generating' ? 'Generating your playlist...' : 'Drop your seed tracks'}
            </h2>
            <p className="text-sm text-gray-400">
              Pick 3-5 songs that represent where your taste is heading. We&apos;ll build a 25-track playlist that pushes you further in that direction.
            </p>
          </div>

          <SeedInput
            seeds={seeds}
            onAddSeed={addSeed}
            onRemoveSeed={removeSeed}
            locked={phase === 'generating'}
          />

          <GenerateButton
            seeds={seeds}
            canGenerate={canGenerate && phase !== 'generating'}
            onResult={handleResult}
          />
        </div>
      )}
    </main>
  );
}
