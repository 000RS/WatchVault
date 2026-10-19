# WatchVault

Your own website for everything you watch: **anime, movies, series and dramas from around the world** (Korean, Turkish, Indian, Pakistani, Chinese, Japanese, Thai and more), with exact progress tracking and a stats dashboard.

Open it from any phone or computer, sign in, and your list is there.

## What it does

| Page | What you can do |
|---|---|
| **My List** | Everything you've added, split into shelves (Anime, Movies, Series, K-Drama, Turkish, Indian, …). Filter by status, sort, search your list, tap **+1 ep** to log the next episode, download a CSV. |
| **Stats** | Total titles watched with the breakdown (X anime, Y movies…), hours and episodes watched, a donut chart of what you watch by %, status, countries and release decades, your top-rated titles, and a just-for-fun **viewer personality**. |
| **New** | Fresh releases, loaded live: airing anime, movies in cinemas, coming soon, trending series, and new K-Dramas, Turkish, Indian, Pakistani, Chinese and Japanese dramas. |
| **Search** | Search all movies and TV ever listed on TMDB plus every anime on AniList. |
| **Title page** | Details, plus your progress: status (Watching, Completed, Plan to watch, On hold, Dropped), **season + episode** for shows ("Season 1, Episode 5"), **how much of a movie** you watched (quarter, half, minutes), rating and notes. |
| **Import** | Bring in your anime list from a MyAnimeList export file, an AniList username, or a pasted list of titles. |

### How it keeps itself updated
The website doesn't store the world's catalogue itself. Every search and every "New" shelf asks **TMDB** and **AniList** live, and both databases add new releases every day. When you open a title that's already in your list, its episode and season counts are refreshed automatically, so a show that gets a new season shows the new episodes.

---

## Setup (about 15 minutes, all free)

You need three free accounts: **Supabase** (stores your list), **TMDB** (movie/TV data), and **Vercel** (hosts the website). Anime data from AniList needs no account.

### 1. Supabase: your database
1. Go to [supabase.com](https://supabase.com), sign up, and click **New project**. Choose any name and a database password, and pick the region closest to you (e.g. Sydney).
2. When it's ready, open **SQL Editor → New query**, paste everything from [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Open **Project Settings → API** (or **Data API**). Copy the **Project URL** and the **anon public** key. You'll need both in step 3.
4. Optional, to sign in instantly without an email confirmation: **Authentication → Sign In / Providers → Email**, and turn off **Confirm email**.

### 2. TMDB: movie and TV data
1. Sign up at [themoviedb.org](https://www.themoviedb.org/signup).
2. Go to **Settings → API** and request an API key (choose *Developer*, personal use; any short description is fine).
3. Copy the long **API Read Access Token**.

### 3. Put it online with Vercel
1. Upload this folder to a new GitHub repository.
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, click **Add New → Project**, and import that repository.
3. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key from step 1 |
   | `TMDB_READ_TOKEN` | API Read Access Token from step 2 |
   | `NEXT_PUBLIC_REGION` | `NZ` (or your country code, for "In cinemas now") |

4. Click **Deploy**. After a minute or two you get a web address like `watchvault-yourname.vercel.app`.
5. Open it, click **Create account**, and sign up with your email and a password.
6. **Lock it down:** back in Supabase, go to **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**. Now only you can log in, from any device.

On your phone, open the site and use **Add to Home Screen** for an app-like icon.

### Running it on your computer (optional)
```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # open http://localhost:3000
```

---

## Tips
- **Wrong shelf?** On the title page, change **Shelf** (for example, put an Indian movie on the Indian shelf instead of Movies).
- **Half-watched movie or Part 1 of a series?** Use the movie progress buttons or minutes, and write anything else in **Notes**.
- **Anime list from MyAnimeList:** export it at `myanimelist.net/panel.php?go=export` and choose the `.xml.gz` file on the Import page.

## How it's built
- **Next.js 15** (React) app, hosted on Vercel.
- **Supabase** Postgres with Row Level Security: each account can only read and change its own rows.
- `app/api/tmdb/route.js` is a small server-side proxy, so the TMDB token is never sent to the browser. It only allows read-only catalogue endpoints and caches responses for an hour.
- AniList's public GraphQL API is called directly from the browser.

```
app/
  page.js                     My List
  stats/page.js               Stats dashboard + viewer personality
  discover/page.js            New releases
  search/page.js              Search
  import/page.js              Import (MAL file, AniList user, pasted titles)
  title/[src]/[type]/[id]/    Title details + progress editor
  api/tmdb/route.js           TMDB proxy
components/                   App shell + sign-in, poster cards, progress editor
lib/                          TMDB/AniList client, shelves, list storage, stats
supabase/schema.sql           Database table + security rules
```

Movie and TV data from [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB. Anime data from [AniList](https://anilist.co).
