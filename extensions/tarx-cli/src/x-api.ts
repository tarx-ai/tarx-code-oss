/**
 * TARX X API v2 Module
 *
 * Connects to X (Twitter) API v2 endpoints.
 * - postTweet: Post a text tweet (requires user-context OAuth 2.0 token)
 * - getUserTimeline: Read a user's recent tweets (app-only bearer)
 * - searchTweets: Search recent tweets (app-only bearer)
 *
 * Required env vars (in .env at repo root):
 *   X_BEARER_TOKEN   — App-only bearer token (for read: timeline, search)
 *   X_ACCESS_TOKEN    — OAuth 2.0 user access token (for write: posting)
 *                       Obtain via PKCE flow at https://developer.x.com/
 *
 * Optional:
 *   X_CLIENT_ID       — OAuth 2.0 client ID (for future PKCE refresh)
 *   X_CLIENT_SECRET   — OAuth 2.0 client secret (confidential clients)
 *   X_USER_ID         — Numeric user ID (skips /users/me lookup in daemon polling)
 */

const X_API_BASE = 'https://api.x.com/2';

// --- Config ---

interface XConfig {
	bearerToken: string;
	accessToken: string;
}

function loadConfig(): XConfig {
	const bearerToken = process.env.X_BEARER_TOKEN || '';
	const accessToken = process.env.X_ACCESS_TOKEN || '';
	if (!bearerToken && !accessToken) {
		throw new Error(
			'X API: No credentials found. Set X_BEARER_TOKEN and/or X_ACCESS_TOKEN in .env'
		);
	}
	return { bearerToken, accessToken };
}

// --- HTTP helpers ---

interface XApiError {
	title: string;
	detail: string;
	status: number;
}

async function xFetch(
	endpoint: string,
	opts: {
		method?: string;
		token: string;
		body?: Record<string, unknown>;
	}
): Promise<any> {
	const url = `${X_API_BASE}${endpoint}`;
	const headers: Record<string, string> = {
		Authorization: `Bearer ${opts.token}`,
		'Content-Type': 'application/json',
	};

	const res = await fetch(url, {
		method: opts.method || 'GET',
		headers,
		body: opts.body ? JSON.stringify(opts.body) : undefined,
	});

	// Rate limit handling
	const remaining = res.headers.get('x-rate-limit-remaining');
	const resetAt = res.headers.get('x-rate-limit-reset');
	if (remaining === '0' && resetAt) {
		const resetDate = new Date(parseInt(resetAt, 10) * 1000);
		const waitMs = resetDate.getTime() - Date.now();
		console.error(`[x-api] Rate limited. Resets at ${resetDate.toISOString()} (${Math.ceil(waitMs / 1000)}s)`);
		throw new Error(`X API rate limit exceeded. Resets in ${Math.ceil(waitMs / 1000)}s`);
	}

	if (!res.ok) {
		let detail = res.statusText;
		try {
			const err = (await res.json()) as XApiError;
			detail = err.detail || err.title || detail;
		} catch { /* use statusText */ }
		throw new Error(`X API ${res.status}: ${detail}`);
	}

	return res.json();
}

// --- Public API ---

/**
 * Post a tweet. Requires X_ACCESS_TOKEN (user-context OAuth 2.0).
 * @returns The tweet ID
 */
export async function postTweet(text: string): Promise<string> {
	const config = loadConfig();
	if (!config.accessToken) {
		throw new Error('X API: X_ACCESS_TOKEN required for posting. Set it in .env');
	}
	if (text.length > 280) {
		throw new Error(`Tweet too long: ${text.length}/280 chars`);
	}

	console.error(`[x-api] Posting tweet (${text.length} chars)...`);
	const data = await xFetch('/tweets', {
		method: 'POST',
		token: config.accessToken,
		body: { text },
	});

	const tweetId = data?.data?.id;
	if (!tweetId) {
		throw new Error('X API: No tweet ID in response');
	}
	console.error(`[x-api] Posted: https://x.com/i/status/${tweetId}`);
	return tweetId;
}

/**
 * Get a user's recent tweets. Uses X_BEARER_TOKEN (app-only).
 * @param username - X handle without @
 * @param limit - Max tweets to return (default 10, max 100)
 */
export async function getUserTimeline(
	username: string,
	limit: number = 10
): Promise<any[]> {
	const config = loadConfig();
	if (!config.bearerToken) {
		throw new Error('X API: X_BEARER_TOKEN required for reading. Set it in .env');
	}

	// Step 1: Resolve username → user ID
	const userRes = await xFetch(`/users/by/username/${encodeURIComponent(username)}`, {
		token: config.bearerToken,
	});
	const userId = userRes?.data?.id;
	if (!userId) {
		throw new Error(`X API: User @${username} not found`);
	}

	// Step 2: Get tweets
	const maxResults = Math.min(Math.max(limit, 5), 100);
	const tweetsRes = await xFetch(
		`/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=created_at,public_metrics,text`,
		{ token: config.bearerToken }
	);

	return tweetsRes?.data || [];
}

/**
 * Search recent tweets (last 7 days). Uses X_BEARER_TOKEN (app-only).
 * @param query - X search query (supports operators)
 * @param limit - Max results (default 10, max 100)
 */
export async function searchTweets(
	query: string,
	limit: number = 10
): Promise<any[]> {
	const config = loadConfig();
	if (!config.bearerToken) {
		throw new Error('X API: X_BEARER_TOKEN required for searching. Set it in .env');
	}

	const maxResults = Math.min(Math.max(limit, 10), 100);
	const params = new URLSearchParams({
		query,
		max_results: String(maxResults),
		'tweet.fields': 'created_at,public_metrics,author_id,text',
	});

	const data = await xFetch(`/tweets/search/recent?${params.toString()}`, {
		token: config.bearerToken,
	});

	return data?.data || [];
}

// --- Mentions (daemon polling) ---

let _cachedUserId: string | null = null;

/**
 * Resolve the authenticated user's numeric ID.
 * Uses X_USER_ID env var if set, otherwise calls /users/me (cached).
 */
async function resolveUserId(token: string): Promise<string> {
	const envId = process.env.X_USER_ID;
	if (envId) return envId;
	if (_cachedUserId) return _cachedUserId;

	const data = await xFetch('/users/me', { token });
	const id = data?.data?.id;
	if (!id) throw new Error('X API: Could not resolve user ID from /users/me');
	_cachedUserId = id;
	return id;
}

/**
 * Get latest mentions of the authenticated user. Uses X_ACCESS_TOKEN.
 * @param sinceId - Only return mentions newer than this tweet ID
 * @param limit - Max results (default 5, min 5, max 100)
 */
export async function getLatestMentions(
	sinceId?: string,
	limit: number = 5
): Promise<any[]> {
	const config = loadConfig();
	const token = config.accessToken || config.bearerToken;
	if (!token) {
		throw new Error('X API: X_ACCESS_TOKEN or X_BEARER_TOKEN required for mentions');
	}

	const userId = await resolveUserId(token);
	const maxResults = Math.min(Math.max(limit, 5), 100);

	const params = new URLSearchParams({
		max_results: String(maxResults),
		'tweet.fields': 'created_at,author_id,text,public_metrics',
	});
	if (sinceId) {
		params.set('since_id', sinceId);
	}

	const data = await xFetch(
		`/users/${userId}/mentions?${params.toString()}`,
		{ token }
	);

	return data?.data || [];
}

/**
 * Extract text content from mention objects.
 * @returns Array of "[@author_id] text" strings
 */
export function processMentions(mentions: any[]): string[] {
	return mentions.map((m: any) => {
		const author = m.author_id || 'unknown';
		const text = (m.text || '').trim();
		return `[@${author}] ${text}`;
	});
}

/**
 * Verify credentials work. Returns true if at least one token is valid.
 */
export async function verifyConnection(): Promise<{ bearer: boolean; user: boolean }> {
	const config = loadConfig();
	const result = { bearer: false, user: false };

	if (config.bearerToken) {
		try {
			await xFetch('/users/me', { token: config.bearerToken });
			result.bearer = true;
		} catch {
			// Bearer tokens can't access /users/me — try a search instead
			try {
				await xFetch('/tweets/search/recent?query=test&max_results=10', {
					token: config.bearerToken,
				});
				result.bearer = true;
			} catch { /* bearer invalid */ }
		}
	}

	if (config.accessToken) {
		try {
			await xFetch('/users/me', { token: config.accessToken });
			result.user = true;
		} catch { /* user token invalid */ }
	}

	return result;
}
