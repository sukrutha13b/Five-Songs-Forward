# Five Songs Forward — System Architecture (MVP)

**Concept:** The user drops 3–5 seed songs. An LLM reads the seeds, describes the direction they collectively point at, and lists adjacent artists and search keywords. The backend runs those through Spotify's catalogue search to build a pool of real tracks, picks a diverse 25, and shows them in the app with a play control and a one-click "Open on Spotify" link per track.

**Audience for this doc:** Business stakeholders. High-level only. No code, no schemas, no library names. A separate implementation doc will follow.

**Build philosophy:** Vibe-coded MVP. Free-tier services only. Simplicity wins over robustness. **Public site — no user login, anyone can try it.**

---

## 1. What the user provides

Everything the user gives the system comes from a single screen:

- **3 to 5 seed songs** — pasted as Spotify links, typed as song names, or picked from a "search as you type" box that queries Spotify's catalogue.
- **Nothing else.** No login, no sliders, no genre picks, no prose. One action: drop seeds, get 25 recommendations.

**Note on scope:** the "lock this direction for 2 weeks" feature described in the concept doc is **out of scope for the MVP** and is not part of this architecture.

---

## 2. Authentication (in plain terms)

**There is no user login.** The app talks to Spotify's public catalogue on behalf of *itself*, not on behalf of any user. This uses a Spotify authentication flow called **Client Credentials** — the app proves its identity to Spotify using its own client ID and secret, and gets back a token that can read public catalogue data.

**What this means in practice:**

- The user never sees a "Log in with Spotify" button.
- The user never leaves the app to approve anything.
- No test-user allowlist, no per-user tokens, no OAuth callback URL, no session state.
- The site is **fully public** from day one — anyone with the URL can use it.

**What this trades away:**

- We cannot read anything user-specific (their recently played, their saved library, their profile).
- We cannot write a playlist into anyone's Spotify account. Instead, we render the 25 recommendations in our own UI. Each track has a play control (30-second preview where Spotify provides one) and an **"Open on Spotify"** link that takes the user to that track in Spotify's own app or web player for full playback.

---

## 3. What data gets retrieved

### From Spotify (the primary data source)

- **Seed track details** — for each of the 5 songs the user drops: the artist, the track name, the track's Spotify ID, and the album art. Also the artist's genre tags where available.
- **Catalogue search results** — the entire candidate pool. The backend runs Spotify's search endpoint against each artist name and keyword the LLM suggests, and collects the top tracks from each query.

That is the **complete** list of what Spotify gives us. See section 4 for what's *not* available and why.

### From the free LLM (primary + secondary failover)

The backend maintains two free LLM providers configured in a **failover chain** — a primary (e.g. Groq) and a secondary (e.g. Google Gemini free tier). Every LLM call goes to the primary first. If the primary returns a rate-limit or error response, the backend **immediately retries the same call against the secondary** — no user-visible delay, no lost work. Both providers receive the same prompt and are expected to return the same kind of output.

- **Direction + retrieval targets** — the LLM is fed the 5 seeds' artist and track names (and any genre tags Spotify gave us), and asked to (a) describe the direction in one short paragraph, (b) return 15–25 adjacent artist names, and (c) return 10–15 search keywords or phrases. Those artist names and keywords become the queries the backend fires at Spotify search.

That is the **only** LLM call per playlist generation.

### What we do **not** retrieve

- Anything user-specific (recently played, saved library, top tracks, profile). We can't — there's no user auth.
- Any playlists.
- Any data from outside Spotify beyond what the LLM already knows.
- Per-track "why this pick" explanations. The 25 results speak for themselves; skipping this keeps LLM usage to one call per generation.

---

## 4. The critical platform constraint that shaped this design

The original concept doc described matching via **audio-feature vectors** (energy, valence, tempo, acousticness) and Spotify's `/recommendations` endpoint. It also implied an **artist-graph** approach — walk from each seed artist to its related artists, then pull top tracks from those adjacent artists to build the candidate pool.

**Endpoint verification (pre-implementation Step 2) confirmed the following endpoints are all restricted for our newly registered app:**

- `/recommendations` — 403
- `/audio-features` — restricted
- `/artists/{id}/related-artists` — **403 confirmed**
- `/artists/{id}/top-tracks` — **403 confirmed**

**What still works for us:**

- `/search` — full catalogue keyword search
- `/tracks/{id}` — resolving pasted links
- `/artists/{id}` — reading artist metadata including genre tags

**The design that survives:**

Because both the artist-graph endpoints AND the audio-feature endpoints are gone, retrieval is neither acoustic-similarity driven nor artist-adjacency driven. It is **LLM-guided catalogue search**:

1. LLM reads the seeds and returns a set of adjacent artist names and search keywords.
2. Backend runs each of those through `/search`.
3. Backend aggregates, dedupes, diversifies, and returns 25.

**What this means for stakeholder conversations:**

- The LLM is not "a nice-to-have interpreter" — it is **the entire retrieval engine's brain**. Without it, we have no direction and no queries to fire.
- Two songs that sound sonically similar but come from artists the LLM doesn't know may not both surface. This is the honest cost of the platform constraint.
- The two-LLM failover chain is now the primary reliability lever. Result caching (same seeds → same 25) further reduces LLM load.

---

## 5. How data flows — step by step

The full journey, in order, from the user opening the app to seeing the 25 recommendations:

1. **User lands on the public site** — no login screen, straight to the seed-input UI.
2. **User drops 3–5 seed songs** on the single-screen UI (paste link, type name, or search).
3. **Frontend sends the seeds to our backend.**
4. **Backend authenticates with Spotify using Client Credentials** — one app-level token call, cached and reused across many user requests.
5. **Backend resolves each seed** — calls Spotify to get the artist, track name, and (where available) the seed artists' genre tags.
6. **Backend sends the seed profile to the LLM** — the seeds' artists/tracks/genres — and asks for a plain-English direction, 15–25 adjacent artist names, and 10–15 search keywords. Goes to the **primary LLM first**; if it's rate-limited or errors, the backend **automatically retries with the secondary LLM** within the same request. The user never sees a difference.
7. **Backend runs Spotify catalogue searches in parallel** — one search per LLM-suggested artist name and one per keyword, taking the top few tracks from each.
8. **Backend assembles the candidate pool**, dedupes, and drops the seed tracks themselves.
9. **Backend applies a diversity pass** — makes sure the 25 picks aren't dominated by a single artist or sub-genre.
10. **Backend picks the final 25 tracks** and returns them to the frontend.
11. **Frontend renders the 25 tracks** — cover art, artist, track name, a 30-second preview player where Spotify supplies one, and a per-track "Open on Spotify" button that opens `open.spotify.com/track/{id}` in a new tab.

---

## 6. Where each API is called and why

Split by which system triggers each call:

### Frontend calls Spotify directly for

- **Nothing.** Every Spotify call goes through our backend so the client secret never touches the browser.

### Backend calls Spotify for

- **App-token acquisition** — one Client Credentials call at startup / on token expiry.
- **Seed resolution** — turning pasted links or typed names into real Spotify track and artist records.
- **Search-as-you-type (optional)** — proxied `/v1/search` calls to power the seed-picker UI.
- **Artist lookup** — `/v1/artists/{id}` for each seed's artist, mainly to read genre tags for the LLM prompt.
- **Retrieval search** — one `/v1/search` per LLM-suggested artist name and keyword.

### Backend calls the LLM for (with automatic failover)

- **Direction + retrieval targets** — one call per generation, feeding it the 5 seeds' artists/tracks/genres, asking for direction, 15–25 adjacent artist names, and 10–15 search keywords. **This is the only LLM call.**

### Why an LLM at all

With the artist-graph and audio-feature endpoints closed, the LLM is the **only source of "where to look next"** — the queries that go into Spotify's search box. Spotify then supplies the actual tracks that match those queries. Our backend picks the final 25.

Crucially, the LLM does **not** name the 25 tracks. If it did, it would hallucinate track names that don't exist on Spotify and we'd have to verify each one — at which point Spotify's search is doing the actual retrieval anyway. So the split is:

- **LLM's job:** understand vibe, name the direction, expand vocabulary (adjacent artists, keywords).
- **Spotify's job:** provide the real tracks that match those queries.
- **Backend's job:** aggregate, dedupe, diversify, pick 25.

---

## 7. What each API call fetches — one line each

**Spotify calls:**

- **Client Credentials token** — one app-level token used for every catalogue read.
- **Get track by ID / search track by name** — turns a seed link or typed name into a real Spotify track.
- **Get artist by ID** — fetches artist details (name, genre tags) for each seed's artist.
- **Search tracks** — the retrieval workhorse; run once per LLM-suggested artist name and keyword.

**LLM calls (primary → secondary failover):**

- **Direction + retrieval targets** — reads the seed profile and returns the direction summary plus adjacent artist names and search keywords. Goes to primary LLM; if rate-limited, retries on secondary.

---

## 8. Where seed and session data is stored

**Nowhere persistent.** No user accounts, no database, no cookies to speak of.

- The seeds live in the browser's page state (React state or equivalent) for the duration of the visit and are sent to the backend with each generation request.
- The backend is stateless — every request is self-contained. It holds nothing about the user between requests. The one thing it caches in-memory is the Spotify app token itself (until it expires), and a result cache keyed on the seed-set hash so repeat seeds don't burn the LLM quota.
- The Spotify app token is a **service credential**, not a user credential.

**Why this is fine for the MVP:**

- The whole flow is a single interaction: drop seeds, get 25 tracks.
- No database to provision, secure, or pay for.
- No user data at rest.

**Known limitation:** if the user reloads the page, they lose the current result set and start fresh. That's acceptable for an MVP.

---

## 9. The output

- A **list of 25 tracks rendered inside our app** — cover art, track name, artist, in a scrollable results view.
- Each track shows a **30-second preview player** (where Spotify supplies a `preview_url` — availability varies by track).
- Each track has an **"Open on Spotify" button** that opens `https://open.spotify.com/track/{id}` in a new tab, so the user can play the full track, save it, or add it to their own playlist directly in Spotify.
- Optional convenience: a "Copy all 25 as Spotify URIs" button so users can paste the whole set into a new playlist themselves.
- Once the tracks are shown, **the app's job is done.** We don't hold anything about the session afterwards.

---

## 10. Other required nodes and cross-cutting concerns

### Backend hosting

- Runs on a **free-tier serverless or lightweight host** (Vercel recommended for a Next.js single deploy — frontend + serverless backend routes in one project).
- Stateless — every request is self-contained.
- Holds the Spotify app credentials and both LLM API keys as environment variables, so they never appear in the browser.

### Rate limiting and abuse protection (critical for a public site)

Because the site is public with no login gate, anyone can spam it and burn our free-tier quota — especially the LLM one. We layer defences:

- **Per-IP rate limit** on the generate endpoint (e.g. 10 generations per hour per IP) using a free-tier key-value store (e.g. Upstash Redis).
- **Bot / abuse challenge** on the generate button — a lightweight, mostly invisible challenge (e.g. Cloudflare Turnstile or hCaptcha).
- **Result caching** — the same seed set produces the same 25 tracks; cache by seed-set hash so repeat requests cost nothing.
- **LLM two-provider failover chain** (already in the architecture) handles provider-side limits.

### Error handling (kept simple for MVP)

- If a seed can't be resolved: show the user a clear "we couldn't find this song" message and let them replace it.
- If Spotify's search fails: retry once, then show a "Spotify is having a moment, please try again" message.
- If the **primary LLM** hits its rate limit or fails: the backend **automatically switches to the secondary LLM** and retries. No user action needed.
- If **both LLMs** fail: the LLM is the entire retrieval engine's brain, so there is nothing sensible to fall back to. Show the user a clean "the recommendation engine is temporarily unavailable, please try again in a few minutes" message. **There is no artist-graph fallback** — the endpoints that would have powered it don't work for our app (see section 4).
- If the rate-limit / abuse challenge blocks a request: show a friendly "you've hit the free-tier limit, try again in an hour" message.

### Privacy and data handling

- No user login, no user data collected, nothing stored on our servers.
- The Spotify token the backend holds is the *app's own* credential, not a user's.

### Spotify branding compliance

- Spotify's developer branding rules apply to any public app using their data — correct wordmark usage, no implied endorsement, proper attribution ("Data from Spotify"). Read these before launch.

### What we're explicitly **not** building for MVP

- The lock-for-2-weeks feature.
- User accounts, saved sessions, or history.
- Any UI for editing or re-generating the playlist beyond re-submitting seeds.
- Writing playlists into anyone's Spotify account.
- Audio-feature-based matching (endpoint restricted).
- Artist-graph-based matching (endpoints restricted).
- Full in-app playback (requires user auth + Premium; "Open on Spotify" covers this).

---

## Appendix — legend for the diagram

| Color in diagram | What it represents |
| --- | --- |
| Grey | User-facing web app (what the user sees) |
| Purple | Our own backend and matching logic |
| Teal | Spotify Web API (search + metadata only, via Client Credentials) |
| Coral | Primary free LLM API |
| Pink | Secondary free LLM API (automatic failover) |
