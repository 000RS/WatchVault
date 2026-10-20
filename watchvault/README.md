# WatchVault

A personal vault for everything you watch: movies, series, anime and dramas from every country, tracked down to the episode. Share it with friends like a profile.

## Upgrading to version 4

Your list stays exactly as it is. Everything here is free, with no card needed anywhere.

1. **Database (once):** Supabase → **SQL Editor** → **New query** → paste [`supabase/upgrade_v4.sql`](supabase/upgrade_v4.sql) → **Run**. (Coming from an older version? Run `upgrade_v2.sql` and `upgrade_v3.sql` first, in that order.)
2. **Make yourself the admin** so feedback reaches you. In the same SQL Editor, run this one line with the email you sign in with:
   ```sql
   update public.profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');
   ```
   Then **Feedback inbox** appears in your menu. Nobody can make themselves admin from the app.
3. **Code:** upload everything from the new `watchvault` folder into your GitHub `watchvault` folder (including the new `public` folder and `vercel.json`) and commit. Vercel redeploys by itself.
4. Open the site, go to **Settings** and pick your streaming services and your goals for the year. Open **Stats → People** once so it can gather cast and crew for your titles.

### Optional extras (all free)

| What | How |
|---|---|
| **Feedback pings on your phone** | In Discord, make a server (or use one), then channel settings → **Integrations → Webhooks → New webhook → Copy URL**. In Vercel → Settings → Environment Variables, add `FEEDBACK_WEBHOOK_URL` with that URL and redeploy. Without it, feedback still lands in your Feedback inbox. |
| **New-episode notifications** | On your computer, run `npx web-push generate-vapid-keys` once. In Vercel add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (the two keys), `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API Keys → service_role, keep it secret) and `CRON_SECRET` (any long random text). Redeploy. People then turn on **New episode alerts** in Settings. Vercel runs the check once a day for free. |

### What's new in version 4

- **New look:** Graphite & Oxblood, a calm dark palette with one deep red accent.
- **Explore + Search in one:** a search bar at the top of Explore with filters for type, language, country and year. Tick off gains country and episode/film length filters and **On my services**. New **Anime season** tab with every anime airing this season, and past seasons.
- **Details panel:** the description with Read more, **Watched today**, your custom lists, reviews with a spoiler switch, tags, a rewatch counter, and an **episode guide** where you tick episodes, rate them, pick a favourite and mark whole seasons.
- **My List:** filter by genre, language, country, decade, your rating and tags; group by genre, language or decade; sort by TMDB rating, length or most rewatched; tag many titles at once.
- **Home:** **Up next** with a one-tap "Watched" for the next episode, and your goals for the year.
- **Calendar:** new episodes of your shows, release dates of films you plan to watch, and anime airing this week.
- **Diary:** every day you watched something, with a year heatmap, streaks, and manual logging. Ticking episodes, finishing titles and rewatches log themselves.
- **Stats dashboard:** filters for period, shelf, format and language over everything; tabs for Overview, People (actors, actresses, directors, writers, composers, studios), When you watch (hours by month, weekdays, every day of the year, release years, decades, film lengths), Taste (genres, genres you rate highest, languages, countries, how you rate, **you vs the world**, hottest takes, rewatches, tags) and Canon. Badges to unlock. Every chart shows details on hover or tap.
- **Wrapped:** a story of your year (hours, finishes, top titles, genre, the actor and actress of your year, your storyteller, countries, biggest month and binge day, highest rated, personality) and a share image. Before December it's your year so far.
- **Lists:** make any list (ranked or not, public or private) and share it.
- **Friends:** taste match % on profiles, "they loved it, you haven't seen it", reviews, public lists, follow public vaults, reactions and spoiler-safe comments on activity, and a leaderboard.
- **Blends:** a shared watchlist with friends, with suggestions none of you have seen and voting for tonight's pick.
- **Imports:** Trakt, TV Time, Simkl, Letterboxd (with watch dates, rewatches and reviews) and IMDb, matched straight from their IDs. Full JSON backup in Settings.
- **Install as an app** on your phone (works offline for your list), and optional new-episode notifications.
- **Feedback** in the menu: bug reports and feature ideas go straight to your inbox.
- **Ask:** quick picks like "I've got 90 minutes" and "something on my services".

## Upgrading to version 3

Your list stays exactly as it is. Everything here is free.

1. **Database (once):** Supabase → **SQL Editor** → **New query** → paste [`supabase/upgrade_v3.sql`](supabase/upgrade_v3.sql) → **Run**. (Coming from version 1? Run `upgrade_v2.sql` first.)
2. **Code:** upload everything from the new `watchvault` folder into your GitHub `watchvault` folder and commit. Vercel redeploys by itself.
3. **Optional, free AI guide:** get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (sign in with Google, no card). In Vercel → **Settings → Environment Variables**, add `GEMINI_API_KEY` with that key, then redeploy. Without it, everything else still works and the Ask tab is simply hidden.
4. Open the site. Tap **Update now** on the anime banner, and **Sort them** on the new-groups banner.

### What's new in version 3

- **Anime merge that works:** each anime is matched on its own. Season entries ("Attack on Titan Season 3") merge into one show with the right seasons ticked. Anything unsure is shown with posters to pick from, or a search box.
- **New statuses:** Stopped (got through a good part, then stopped), Tried (a few episodes), Seen clips (from reels, TikTok or YouTube), next to Completed, Watching, Plan to watch, On hold and Dropped.
- **Animation shelf** for non-anime cartoons and animated films.
- **Stats:** finish rate per shelf, counts for every status, and stats for one shelf at a time.
- **Explore:** Netflix-style rows (top picks, because you love…, because you watched…, best-loved in a language you watch, hidden gems); Studios & people (Marvel, DC, Pixar, Ghibli, MAPPA, Yash Raj, Studio Dragon and more, plus any actor, director or writer); more filters (streaming service, language, rating, taste, hidden gems, newest); a Refresh that shows new titles on every tab.
- **Details open in a panel** over the page, so you never lose your place. Going back from a full page restores the grid and the scroll position.
- **Where to watch** in your country on every title, cast and crew links, studios, and franchise watch order (e.g. Star Wars in release order).
- **Search** forgives spelling ("chota bheem" finds Chhota Bheem) and finds people from every country.
- **Ask:** a free AI guide that knows your list, asks what you're in the mood for and answers like a person. It plans franchise watch orders and shows its picks as cards you can tick.
- New look: clearer fonts and a vivid colour palette on a dark background.

### Staying free

Every service here has a free plan, and nothing needs a card:

- **Supabase free plan:** a project pauses after about a week with no visits. Opening the site, or tapping Restore in Supabase, wakes it.
- **Vercel Hobby:** free for personal use.
- **TMDB:** free for personal, non-commercial use.
- **Gemini free tier:** has daily limits, and Google may use free-tier conversations to improve its products. If you hit the limit, the guide asks you to try again later.

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
| **Studios & people** | Studio, actor, director and writer pages with everything they've made, and franchise pages in watch order. |
| **Settings** | Username, bio, public profile, showcase size, which shelves appear in your feed, Home layout, CSV download. |

## First-time setup (new installs only)

You need free accounts at **Supabase** (database), **TMDB** (title data) and **Vercel** (hosting).

1. **Supabase:** create a project. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql), then `upgrade_v2.sql`, `upgrade_v3.sql` and `upgrade_v4.sql` in that order. Copy the Project URL and the anon public key from **Project Settings → API Keys**.
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
- Database triggers record history and the diary automatically.
- `public/sw.js` makes the site installable and fast offline; `app/api/cron/notify` (optional) sends new-episode notifications once a day.

Title data and images come from [TMDB](https://www.themoviedb.org) and [AniList](https://anilist.co). This product uses the TMDB API but is not endorsed or certified by TMDB.
