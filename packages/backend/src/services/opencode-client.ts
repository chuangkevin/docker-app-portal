const OPENCODE_TIMEOUT_MS = 10_000;

function buildAuthHeader(): Record<string, string> {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) return {};
  const encoded = Buffer.from(`:${password}`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

function splitModel(model: string): { providerID: string; id: string } {
  const idx = model.indexOf('/');
  if (idx === -1) return { providerID: model, id: model };
  return { providerID: model.slice(0, idx), id: model.slice(idx + 1) };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseTextFromBody(body: unknown): string {
  // body may be an array of event objects or a single object
  if (Array.isArray(body)) {
    return body
      .filter((e): e is { type: string; value: string } => e?.type === 'text' && typeof e?.value === 'string')
      .map((e) => e.value)
      .join('');
  }

  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (obj.type === 'text' && typeof obj.value === 'string') {
      return obj.value;
    }
    // parts[].text style
    if (Array.isArray(obj.parts)) {
      return (obj.parts as Array<{ text?: string }>)
        .map((p) => p?.text ?? '')
        .join('');
    }
  }

  return '';
}

export async function callOpenCodeText(
  serverUrl: string,
  model: string,
  prompt: string,
): Promise<string> {
  const base = serverUrl.replace(/\/$/, '');
  const authHeaders = buildAuthHeader();
  const { providerID, id } = splitModel(model);

  // 1. Create session
  const createRes = await fetchWithTimeout(
    `${base}/session`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ model: { providerID, id } }),
    },
    OPENCODE_TIMEOUT_MS,
  );

  if (!createRes.ok) {
    throw new Error(`OpenCode createSession failed: ${createRes.status} ${createRes.statusText}`);
  }

  const sessionData = (await createRes.json()) as { id?: string };
  const sessionId = sessionData.id;
  if (!sessionId) {
    throw new Error('OpenCode createSession returned no session id');
  }

  // 2. Send message
  let text = '';
  try {
    const msgRes = await fetchWithTimeout(
      `${base}/session/${sessionId}/message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ parts: [{ text: prompt }] }),
      },
      OPENCODE_TIMEOUT_MS,
    );

    if (!msgRes.ok) {
      throw new Error(`OpenCode sendMessage failed: ${msgRes.status} ${msgRes.statusText}`);
    }

    const rawBody: unknown = await msgRes.json();
    text = parseTextFromBody(rawBody);
  } finally {
    // 3. Delete session fire-and-forget
    fetchWithTimeout(
      `${base}/session/${sessionId}`,
      { method: 'DELETE', headers: { ...authHeaders } },
      OPENCODE_TIMEOUT_MS,
    ).catch(() => {
      // intentionally ignored
    });
  }

  return text;
}
