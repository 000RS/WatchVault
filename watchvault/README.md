# WatchVault

A personal vault for everything you watch: movies, series, anime and dramas from every country, tracked down to the episode. Share it with friends like a profile.

## Upgrading from version 1

Your list is stored in Supabase, not in the code, so nothing you've added is lost.

1. **Update the database (once).** Supabase → **SQL Editor** → **New query** → paste everything from [`supabase/upgrade_v2.sql`](supabase/upgrade_v2.sql) → **Run**. It only adds new tables and fields.
2. **Upload the new code.** In GitHub, open your repo's `watchvault` folder → **Add file → Upload files** → drag in everything from the new `watchvault` folder → **Commit changes**. Files with the same name are replaced.
3. **Wait for Vercel.** It redeploys by itself in about two minutes. Environment variables stay the same.
4. **Optional:** in **Settings → Your data**, click **Link anime to TMDB**. Anime you imported in version 1 then gets full seasons and counts in the rankings.

## What's in version 2

| Area | What you can do |
|---|---|
| **Home** | Your vault: a showcase of your top titles, totals, continue watching, top lists, recently watched, friends' activity and your taste. You choose the sections and their order in Settings. |
| **My List** | Opens instantly, even on slow connections. Filter by shelf and status, sort by rating or how well-known a title is. **⋯** on any poster edits status, season, episode and rating without leaving the page. **Select** changes many titles at once. Coming back from a title returns you to the same spot. |
| **Explore** | **For you**: "Because you watched…" rows. **Tick off**: the best-known titles by type, year, decade and genre; tap ✓ for watched or ⋯ for half watched, watching, plan to watch or dropped. Titles you've added disappear so the next ones come up. **New**: fresh releases. |
| **Search** | Every movie and series on TMDB, plus anime from AniList. Filter by type and year. Typos get a "Did you mean" suggestion. |
| **Title page** | Seasons, details and "More like this". Status, seasons finished, the exact episode, how much of a movie you saw, rating, when you watched it, shelf and private notes. Everything saves as you go. |
| **Top lists** | Rank an overall top 10 and a top 10 for each shelf. Your profile shows the top 3, 5 or 10. |
| **Stats** | Hours, episodes, countries, your viewer personality, taste by decade and year, genres, and how much of each "canon" you've seen (top 100 anime, top 50 rom-com movies, and more) with a tier. |
| **Friends** | Find people by username, send requests, and see what friends are watching. |
| **Profile** | `your-site/u/username`. Friends can always see it; turn on **Public profile** in Settings to share it with anyone. Private notes are never shown. |
| **History** | Every title you added or changed, grouped by day. |
| **Import** | Excel, CSV, Word, text, Letterboxd, IMDb, MyAnimeList or an AniList username. Headings like "Completed" or "Dropped" apply to the lines below them. Titles are matched on the server in seconds, typos included. You review everything first, and only the lines that couldn't be matched are left for you to fix. |
| **Settings** | Username, bio, public profile, showcase size, which shelves appear in your feed, Home layout, CSV download. |

## First-time setup (new installs only)

You need free accounts at **Supabase** (database), **TMDB** (title data) and **Vercel** (hosting).

1. **Supabase:** create a project. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql), then [`supabase/upgrade_v2.sql`](supabase/upgrade_v2.sql). Copy the Project URL and the anon public key from **Project Settings → API Keys**.
2. **TMDB:** sign up, then **Settings → API**, and copy the **API Read Access Token**.
3. **Vercel:** import the GitHub repo. Set **Root Directory** to the folder that has `package.json`, and add these environment variables:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL, e.g. `https://abcd.supabase.co` (nothing after `.co`) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `TMDB_READ_TOKEN` | API Read Access Token |
   | `NEXT_PUBLIC_REGION` | Your country code for "In cinemas", e.g. `NZ` |

4. In Supabase → **Authentication → URL Configuration**, set **Site URL** to your Vercel address so confirmation emails link back to your site.

## Running it on your computer

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
```

## How it's built

- **Next.js 15** app on Vercel. **Supabase** Postgres with row-level security: each account edits only its own rows; friends and public visitors read through `shared_entries`, a view without private notes.
- `app/api/tmdb` proxies TMDB so the token stays on the server. `app/api/match` matches up to 60 titles per request, 8 at a time: TMDB first, AniList to recognise anime names, then simplified versions of the text. `app/api/benchmarks` builds the ranking lists once a day.
- `lib/store.js` keeps your list on the device and in memory, so pages render immediately. Changes appear at once and save in the background.
- `lib/extract.js` reads files and free text into title lines. `lib/match.js` scores how close typed text is to a real title.
- A database trigger records history automatically.

Title data and images come from [TMDB](https://www.themoviedb.org) and [AniList](https://anilist.co). This product uses the TMDB API but is not endorsed or certified by TMDB.
