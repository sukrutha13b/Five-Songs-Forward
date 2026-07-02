# Five Songs Forward

**Push your music taste forward, not sideways.**

Five Songs Forward is a music discovery web app that fixes the way most recommendation engines get stuck circling the same artists you already listen to. You drop three to five seed songs that represent *where your taste is heading*, and the app returns a twenty-five track playlist that is deliberately **adjacent** to those seeds — not more of the same. It is a graduation-project MVP built as a public, login-free web app that hands users off to Spotify to actually play the tracks.

- **Native-Spotify design concept (Figma mock):** [Figma file](https://www.figma.com/design/G1190ICX3SKMprvSZ49pNf)
- **System architecture (business audience):** [docs/architecture.md](docs/architecture.md)
- **Architecture diagram:** [docs/architecture.drawio](docs/architecture.drawio) *(open in draw.io / diagrams.net)*

---

## The problem

Long-tenured Spotify users hit an "algorithmic plateau" — recommendations keep surfacing artists they were into two or three years ago, even though their taste has moved on. The platform learns from what they play, but it does not have a channel for them to *tell* it where they are heading next. Existing surfaces (Daily Mixes, Discover Weekly, Made For You) all optimise for what has been heard, not what should come next.

Five Songs Forward is a one-screen answer to that: give users a lightweight way to point at a new direction and get a concrete, playable proof point in twenty-five tracks.

## What the user sees

A single screen. No login, no genre pickers, no sliders, no prose. The user:

1. Drops three to five seed songs — pasted Spotify links, typed titles, or picked from search-as-you-type.
2. Taps **Generate**.
3. Sees twenty-five tracks rendered in the app with cover art, artist, track name, an in-app preview player (where Spotify supplies a 30-second preview), and a per-track **Open on Spotify** button that opens the track in Spotify's own app or web player for full playback.

Above the tracks, three signals explain *why* those tracks were chosen: a one-sentence description of the musical direction, a row of niche sub-genre keyword chips, and a row of adjacent-artist chips. These are the exact retrieval targets that generated the playlist — the app shows its work.

## Native-Spotify design concept (Figma mock)

Because Spotify does not permit third-party features inside their own app, the shipped product lives as a standalone web app. The pitch, however, argues that this feature *belongs* natively inside Spotify. The [Figma file](https://www.figma.com/design/G1190ICX3SKMprvSZ49pNf) contains three high-fidelity Android mocks (412×915) that show what the feature would look like if Spotify themselves shipped it:

1. **Home entry** — a Five Songs Forward hero card at the top of the Home tab.
2. **Seed input** — the user has added five seed songs, with a "Lock this direction for 2 weeks" toggle and a Generate CTA.
3. **Results** — a twenty-five track playlist rendered inside Spotify's native playlist UI, with the direction sentence, sub-genre chips, adjacent-artist chips, and "From your library" tags on the two tracks the direction rescued from the user's own saved music.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 16 (App Router)** | Single deployable — frontend + serverless backend routes in one project. |
| Language | **TypeScript** | Type safety across the API boundary and the LLM/Spotify data shapes. |
| UI | **React 19** | Standard, well-supported. |
| Styling | **Tailwind CSS v4** | Fast iteration on a single-screen UI. |
| Runtime | **Vercel serverless functions** | Free-tier hosting; stateless request model matches the app. |
| Primary LLM | **Groq — `llama-3.3-70b-versatile`** | Fast, generous free tier. |
| Fallback LLM | **Google Gemini — `gemini-2.0-flash`** | Automatic failover when Groq is rate-limited. |
| Music data | **Spotify Web API** | Client Credentials flow — the app authenticates as itself, no user login. |

Package versions are pinned in [`package.json`](package.json).

## APIs used

### Spotify Web API (Client Credentials)

The backend authenticates as the app using [Client Credentials](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow) so the user never sees a login screen. The app token is cached in-process and refreshed as it nears expiry. Three Spotify endpoints are called:

- **`POST /api/token`** — one Client Credentials call, cached until expiry.
- **`GET /v1/search?type=track`** — the retrieval workhorse; called once per LLM-suggested artist (`artist:"Name"` query, top 6 results) and once per LLM-suggested keyword (top 40 results, offset 15 to skip the mainstream).
- **`GET /v1/tracks/{id}`** — resolving pasted Spotify links into real track records.

Not used (all restricted for our newly-registered app — see [docs/architecture.md § 4](docs/architecture.md)): `/recommendations`, `/audio-features`, `/artists/{id}/related-artists`, `/artists/{id}/top-tracks`.

### LLM providers

Both providers receive the identical prompt and return identical JSON structure. Failover is automatic and invisible to the user.

- **Groq Chat Completions API** — attempted first.
- **Google Generative AI SDK** — retried automatically if Groq is rate-limited or errors.

A process-wide token bucket caps total LLM traffic at 25 requests per minute (safely below Groq's 30 RPM and Gemini's 15 RPM free-tier ceilings). Retries respect `Retry-After` headers with jittered exponential backoff.

---

## The matching logic

The interesting engineering choice sits between the LLM and Spotify's search. In one sentence: **the LLM is the retrieval engine's brain, and Spotify's search is its muscle.** The LLM never names tracks (it would hallucinate); it names the *neighbourhood*. Spotify names the tracks within that neighbourhood.

### 1 · Seed interpretation (one LLM call per generation)

The backend sends the five seed tracks — artist and track names only — to the LLM with a strict JSON-output prompt. The LLM returns three things:

- **`directionSummary`** — one or two sentences of prose describing where the seeds are pointing (era, scene, register). Rendered above the results.
- **`artists`** — fifteen to twenty-five top-of-scene artists whose catalogues fit the direction. These become the **safe, familiar-adjacent** picks.
- **`keywords`** — ten to fifteen *niche* sub-genre or micro-scene tags (`"midwest emo"`, `"slowcore revival"`, `"twee pop"` — never broad umbrella genres like `"indie folk"`). These become the **deep-cut discovery** picks.

### 2 · Parallel Spotify catalogue search

The backend fires the artist and keyword queries at Spotify's `/v1/search` in parallel:

- Each **artist** name becomes an `artist:"Name"` query, taking the top 6 tracks.
- Each **keyword** query is issued verbatim, but the backend takes results at **offset 15** and reads through result 55 — skipping the mainstream top hits so the keyword surfaces artists the LLM did *not* already name.

### 3 · Classification and quotas

Every candidate is classified as `named-artist` (its primary artist is in the LLM's artist list) or `discovery` (it is not). The final twenty-five is composed with a deliberate discovery bias:

- **15 discovery slots** — surface artists the LLM did not directly name.
- **10 named-artist slots** — the safe adjacencies.
- **Max 2 tracks per artist** — enforce diversity.
- **Backfill** — if either quota is short, pull from the remaining pool; as a last resort, relax the per-artist cap.

### 4 · Ranking and shuffle

Candidates are scored by their query rank (`1 / (1 + queryRank × 0.02)`) so higher-ranked search hits win ties, then the final list is shuffled so the highest-scoring track does not always sit at position #1. The shuffle makes the playlist feel discovered, not sorted.

### Why this shape

The original concept called for matching on Spotify's audio-feature vectors and walking the related-artists graph. Both endpoint families are restricted for newly-registered Spotify apps (verified during pre-implementation). What remains available is `/search` — so the design pivoted to an **LLM-guided catalogue search** where the LLM writes the queries. Full detail on this constraint and the design decisions that flowed from it is in [docs/architecture.md](docs/architecture.md).

---

## Local development

### Prerequisites

- Node.js 20+
- A Spotify developer app (Client Credentials — no redirect URI needed)
- A [Groq API key](https://console.groq.com/) (free)
- A [Google AI Studio API key](https://aistudio.google.com/) for Gemini (free)

### Environment variables

Create a `.env.local` file at the project root:

```
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
```

### Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

### Build

```bash
npm run build
npm run start
```

---

## Repository layout

```
five-songs-forward/
├── docs/
│   ├── architecture.md          # Business-audience system architecture
│   └── architecture.drawio      # Architecture diagram (open in draw.io)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── generate/         # POST /api/generate — the main pipeline
│   │   │   └── spotify/
│   │   │       ├── search/       # GET  /api/spotify/search — seed search
│   │   │       └── track/        # GET  /api/spotify/track  — resolve link
│   │   ├── page.tsx              # Single-screen UI
│   │   └── layout.tsx
│   ├── components/               # SeedInput, SeedCard, GenerateButton,
│   │                             # PlaylistResult, TrackCard
│   ├── hooks/
│   │   └── useSeeds.ts           # Seed-set state
│   └── lib/
│       ├── llm.ts                # Groq → Gemini failover, prompts, retries
│       ├── matching.ts           # Candidate pooling, quotas, ranking
│       ├── spotify.ts            # Client Credentials, search, track lookup
│       └── types.ts
├── package.json
├── next.config.ts
└── README.md
```

---

## What we deliberately did not build

Kept out of scope for a stateless, login-free MVP:

- **User accounts, saved sessions, or history** — no database.
- **Writing playlists into anyone's Spotify account** — would require user OAuth. The user opens tracks in Spotify directly instead.
- **Lock-a-direction-for-two-weeks** — the concept doc's user-retention hook. Requires user identity and a scheduled job.
- **Audio-feature or artist-graph matching** — Spotify endpoints restricted for new apps.
- **Per-track "why this pick" reasoning** — would multiply LLM cost and latency. The overall direction sentence + chip vocabulary carry the "why".

---

## License and attribution

Music metadata comes from Spotify's Web API — data is displayed subject to [Spotify Developer Terms](https://developer.spotify.com/terms). This project is a student graduation-project MVP and is not affiliated with, endorsed by, or a product of Spotify AB.
