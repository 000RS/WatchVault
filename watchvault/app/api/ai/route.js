// The WatchVault guide: a conversational helper built on Google's free Gemini API tier.
// It can look titles up, find franchise orders and streaming options, then show picks as cards.
//
// GET  /api/ai                → { enabled }
// POST /api/ai { messages, list, hidden }   → { reply, cards }
// POST /api/ai { mode: 'resolve', q }       → { titles }   (what a misspelt search probably meant)
//
// Needs GEMINI_API_KEY (free from Google AI Studio, no card). Signed-in users only.

import { tmdbServer } from '@/lib/tmdbServer';
import { normalizeTmdb } from '@/lib/catalog';

export const maxDuration = 60;

const KEY = () => process.env.GEMINI_API_KEY;
const REGION = process.env.NEXT_PUBLIC_REGION || 'NZ';
const API = 'https://generativelanguage.googleapis.com/v1beta';

export async function GET() {
  return Response.json({ enabled: Boolean(KEY()) });
}

/* ---------------- Who is asking ---------------- */

const okTokens = new Map();
async function signedIn(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const hit = okTokens.get(token);
  if (hit && hit > Date.now()) return true;
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');
  const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anon) return false;
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } }).catch(() => null);
  if (res?.ok) {
    okTokens.set(token, Date.now() + 5 * 60 * 1000);
    return true;
  }
  return false;
}

/* ---------------- Which free model to use ---------------- */

let models = null;
async function modelList() {
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL];
  if (models) return models;
  try {
    const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': KEY() } });
    const d = await res.json();
    const version = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    models = (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/(image|tts|audio|live|embedding|exp|thinking)/.test(n))
      .sort((a, b) => version(b) - version(a) || Number(/preview/.test(a)) - Number(/preview/.test(b)) || Number(/lite/.test(a)) - Number(/lite/.test(b)))
      .slice(0, 4);
  } catch {
    models = [];
  }
  if (!models.length) models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  return models;
}

async function gemini(body) {
  let last = null;
  for (const m of await modelList()) {
    const res = await fetch(`${API}/models/${m}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY() },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) return d;
    last = d.error?.message || `Guide error ${res.status}`;
    // Quota used up or model retired: try the next free model.
    if (![404, 429, 503].includes(res.status)) break;
  }
  throw new Error(/quota|rate/i.test(last || '') ? 'The free guide is busy for a moment. Try again in a minute.' : last || 'The guide is unavailable right now.');
}

/* ---------------- Tools the guide can use ---------------- */

const TOOLS = [
  {
    name: 'search_titles',
    description: 'Search movies and TV series (all countries, including anime and dramas). Use this to confirm any title before recommending it.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Title or keywords' }, type: { type: 'string', enum: ['any', 'movie', 'tv'] } },
      required: ['query'],
    },
  },
  {
    name: 'find_franchise',
    description: 'Get a film franchise (collection) with every film in release order, e.g. "Star Wars", "Harry Potter".',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'where_to_watch',
    description: `Streaming, rent and buy options in the user's country (${REGION}) for one title.`,
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer' }, media_type: { type: 'string', enum: ['movie', 'tv'] } },
      required: ['id', 'media_type'],
    },
  },
  {
    name: 'show_titles',
    description: 'Show titles to the user as tappable cards, in the order given. Use for every recommendation or watch order.',
    parameters: {
      type: 'object',
      properties: {
        titles: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'integer' }, media_type: { type: 'string', enum: ['movie', 'tv'] }, note: { type: 'string', description: 'A few words on why or where it fits' } },
            required: ['id', 'media_type'],
          },
        },
      },
      required: ['titles'],
    },
  },
];

async function runTool(name, args, seen, cards) {
  if (name === 'search_titles') {
    const t = args.type === 'movie' ? 'search/movie' : args.type === 'tv' ? 'search/tv' : 'search/multi';
    const d = await tmdbServer(t, { query: String(args.query || '').slice(0, 100), include_adult: 'false' });
    const out = (d.results || [])
      .filter((r) => (r.media_type || (args.type === 'movie' ? 'movie' : 'tv')) !== 'person')
      .slice(0, 6)
      .map((r) => {
        const it = normalizeTmdb(r, r.media_type || (args.type === 'movie' ? 'movie' : 'tv'));
        seen.set(`${it.mediaType}:${it.sourceId}`, it);
        return { id: Number(it.sourceId), media_type: it.mediaType, title: it.title, year: it.year, rating: it.rating, overview: (it.overview || '').slice(0, 180) };
      });
    return { results: out };
  }
  if (name === 'find_franchise') {
    const s = await tmdbServer('search/collection', { query: String(args.query || '') });
    const c = s.results?.[0];
    if (!c) return { error: 'No franchise found' };
    const full = await tmdbServer(`collection/${c.id}`);
    const parts = (full.parts || [])
      .map((r) => normalizeTmdb(r, 'movie'))
      .filter((i) => i.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    parts.forEach((p) => seen.set(`movie:${p.sourceId}`, p));
    return { name: full.name, films_in_release_order: parts.map((p) => ({ id: Number(p.sourceId), media_type: 'movie', title: p.title, year: p.year })) };
  }
  if (name === 'where_to_watch') {
    const d = await tmdbServer(`${args.media_type}/${args.id}/watch/providers`);
    const r = d.results?.[REGION];
    if (!r) return { region: REGION, note: 'Not available to stream or buy here as far as we know.' };
    const names = (l) => (l || []).map((p) => p.provider_name);
    return { region: REGION, stream: names(r.flatrate), free: names(r.free).concat(names(r.ads)), rent: names(r.rent), buy: names(r.buy) };
  }
  if (name === 'show_titles') {
    for (const t of (args.titles || []).slice(0, 20)) {
      const k = `${t.media_type}:${t.id}`;
      let item = seen.get(k);
      if (!item) {
        try {
          item = normalizeTmdb(await tmdbServer(`${t.media_type}/${t.id}`), t.media_type);
        } catch {
          continue;
        }
      }
      if (!cards.some((c) => c.mediaType === item.mediaType && c.sourceId === item.sourceId)) cards.push({ ...item, note: t.note || null });
    }
    return { shown: cards.length };
  }
  return { error: 'Unknown tool' };
}

const SYSTEM = (list, hidden, services = []) => `You are the WatchVault guide: a warm, sharp friend who knows film and TV from every country (Hollywood, Bollywood and other Indian cinema, Pakistani and Turkish dramas, K-dramas, anime, animation and more).

How you talk:
- Plain, natural and kind, like a person, never like a brochure. Short paragraphs. No headings.
- If what they want is unclear, ask one short question at a time before recommending (mood, time, who they're watching with, what they loved before). Don't interrogate: two questions at most before giving something useful.
- Be honest about trade-offs (slow start, dark themes, filler arcs, which seasons are weaker).

How you work:
- Only recommend titles you have confirmed with search_titles or find_franchise. Never invent titles, years or facts.
- For watch orders (e.g. Star Wars, Marvel, Fate, Monogatari), explain the options briefly (release order vs story order vs a shorter "essentials" path) and pick one that suits this person.
- Use where_to_watch when they ask how or where to watch. The user is in ${REGION}.
- Always finish recommendations by calling show_titles with the picks in order, with a short note each. Then reply with a brief message; don't repeat the whole list in text.
- Don't recommend things they've already completed unless they ask for rewatches; you may mention them as context.
${services.length ? `- Their streaming services: ${services.join(', ')}. When they ask for something "on my services", check where_to_watch and prefer titles streaming on these.\n` : ''}${hidden.length ? `- They have hidden these shelves, so avoid them unless asked: ${hidden.join(', ')}.` : ''}

What they have in their list (title, year, status, their rating out of 10):
${list || '(nothing yet)'}`;

/* ---------------- Handler ---------------- */

export async function POST(request) {
  if (!KEY()) return Response.json({ error: 'The guide is not set up. Add GEMINI_API_KEY in Vercel (see README).' }, { status: 501 });
  if (!(await signedIn(request))) return Response.json({ error: 'Sign in to use the guide.' }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }

  try {
    if (body.mode === 'resolve') {
      const q = String(body.q || '').slice(0, 120);
      const d = await gemini({
        contents: [
          {
            role: 'user',
            parts: [{ text: `Someone typed "${q}" into a movie and TV search box. It may be misspelt, transliterated (Hindi, Urdu, Japanese, Turkish…), a nickname, or a description. Reply with a JSON array of up to 3 official English or original titles they most likely mean. Only real titles. Example: ["Chhota Bheem"]` }],
          },
        ],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 200 },
      });
      const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '[]';
      let titles = [];
      try {
        titles = JSON.parse(text);
      } catch {
        titles = [];
      }
      return Response.json({ titles: (Array.isArray(titles) ? titles : []).filter((t) => typeof t === 'string').slice(0, 3) });
    }

    const history = (Array.isArray(body.messages) ? body.messages : []).slice(-16);
    const contents = history
      .filter((m) => m && typeof m.text === 'string' && m.text.trim())
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text.slice(0, 4000) }] }));
    if (!contents.length || contents[contents.length - 1].role !== 'user') return Response.json({ error: 'Say something first.' }, { status: 400 });

    const list = String(body.list || '').slice(0, 24000);
    const hidden = Array.isArray(body.hidden) ? body.hidden.slice(0, 20).map(String) : [];
    const services = Array.isArray(body.services) ? body.services.slice(0, 20).map((x) => String(x).slice(0, 40)) : [];
    const seen = new Map();
    const cards = [];
    let reply = '';

    for (let step = 0; step < 7; step++) {
      const d = await gemini({
        systemInstruction: { parts: [{ text: SYSTEM(list, hidden, services) }] },
        contents,
        tools: [{ functionDeclarations: TOOLS }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 1500 },
      });
      const content = d.candidates?.[0]?.content;
      if (!content?.parts?.length) break;
      contents.push(content); // keep the model's turn exactly as sent (some models need their signatures back)
      const calls = content.parts.filter((p) => p.functionCall);
      const text = content.parts.map((p) => p.text || '').join('').trim();
      if (!calls.length) {
        reply = text;
        break;
      }
      if (text) reply = text;
      const responses = [];
      for (const c of calls) {
        let result;
        try {
          result = await runTool(c.functionCall.name, c.functionCall.args || {}, seen, cards);
        } catch (e) {
          result = { error: e.message || 'Tool failed' };
        }
        responses.push({ functionResponse: { name: c.functionCall.name, response: result } });
      }
      contents.push({ role: 'user', parts: responses });
    }

    return Response.json({ reply: reply || (cards.length ? 'Here you go.' : "Sorry, I couldn't come up with anything for that. Could you tell me a bit more?"), cards });
  } catch (e) {
    return Response.json({ error: e.message || 'The guide is unavailable right now.' }, { status: 502 });
  }
}
