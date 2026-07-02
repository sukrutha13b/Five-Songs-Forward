'use client';

import { useState } from 'react';
import { useSeeds } from '@/hooks/useSeeds';
import SeedInput from '@/components/SeedInput';
import GenerateButton from '@/components/GenerateButton';
import PlaylistResult from '@/components/PlaylistResult';
import { GeneratedPlaylist } from '@/lib/types';

type Phase = 'input' | 'generating' | 'result';

export default function Home() {
  const { seeds, addSeed, removeSeed, canGenerate, clearSeeds } = useSeeds();
  const [phase, setPhase] = useState<Phase>('input');
  const [playlist, setPlaylist] = useState<GeneratedPlaylist | null>(null);

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
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">
          Five Songs <span className="text-[#1DB954]">Forward</span>
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Drop 3–5 songs. We&apos;ll build a 25-track playlist that pushes your taste forward.
        </p>
      </div>

      {phase === 'result' && playlist ? (
        <PlaylistResult playlist={playlist} onStartOver={handleStartOver} />
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="mb-2 text-xl font-semibold">
              {phase === 'generating' ? 'Building your playlist…' : 'Drop your seed tracks'}
            </h2>
            <p className="text-sm text-gray-400">
              Pick 3–5 songs that represent where your taste is heading.
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
