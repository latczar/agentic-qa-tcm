import type { FrameworkManifest } from '@aiqa/framework-manifest';

export interface Symbol {
  /** For example "LeavePage.submitRequest", "LoginPage.emailInput", "fixture:signInAs". */
  id: string;
  kind: 'method' | 'locator' | 'fixture' | 'helper' | 'user' | 'seeded' | 'pageObject';
  owner: string | null;
  description: string;
  signature: string;
}

/** Everything a spec might legitimately reference, flattened for search and "did you mean". */
export function symbolsOf(manifest: FrameworkManifest): Symbol[] {
  const out: Symbol[] = [];
  for (const p of manifest.pageObjects) {
    out.push({
      id: p.name,
      kind: 'pageObject',
      owner: null,
      description: p.description,
      signature: p.appField ? `app.${p.appField}` : p.name,
    });
    for (const m of p.methods) {
      out.push({
        id: `${p.name}.${m.name}`,
        kind: 'method',
        owner: p.name,
        description: m.description,
        signature: `${m.name}(${m.params.map((x) => `${x.name}${x.optional ? '?' : ''}: ${x.type}`).join(', ')}): ${m.returns}`,
      });
    }
    for (const l of p.locators) {
      out.push({
        id: `${p.name}.${l.name}`,
        kind: 'locator',
        owner: p.name,
        description: l.description,
        signature: l.testId ? `data-testid="${l.testId}"` : l.expression,
      });
    }
  }
  for (const f of manifest.fixtures) {
    out.push({
      id: `fixture:${f.name}`,
      kind: 'fixture',
      owner: null,
      description: f.description,
      signature: f.type,
    });
  }
  for (const h of manifest.helpers) {
    out.push({
      id: h.name,
      kind: 'helper',
      owner: null,
      description: h.description,
      signature: `${h.name}(${h.params.map((x) => `${x.name}: ${x.type}`).join(', ')}): ${h.returns}`,
    });
  }
  for (const u of manifest.users) {
    out.push({
      id: `users.${u.key}`,
      kind: 'user',
      owner: null,
      description: u.description,
      signature: `${u.firstName} ${u.lastName}, ${u.role}, ${u.id}`,
    });
  }
  for (const s of manifest.seeded) {
    out.push({
      id: `seeded.${s.key}`,
      kind: 'seeded',
      owner: null,
      description: s.description,
      signature: s.value,
    });
  }
  return out;
}

export interface Match {
  symbol: Symbol;
  score: number;
}

/**
 * Ranked, case-insensitive search. In order of strength: exact name, prefix, substring,
 * shared words (so an invented "submitLeave" still finds LeaveFormPage.submitRequest),
 * close spelling, then a mention in the description.
 */
export function searchSymbols(symbols: Symbol[], query: string, limit = 10): Match[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const queryTokens = tokens(query);
  const matches: Match[] = [];
  for (const symbol of symbols) {
    const id = symbol.id.toLowerCase();
    const leaf = id.split(/[.:]/).pop() ?? id;
    let score = 0;
    if (id === q || leaf === q) score = 100;
    else if (leaf.startsWith(q) || id.startsWith(q)) score = 80;
    else if (id.includes(q)) score = 60;
    else {
      const symbolTokens = new Set(tokens(symbol.id));
      const shared = queryTokens.filter((t) => t.length >= 3 && symbolTokens.has(t)).length;
      const distance = levenshtein(leaf, q);
      if (distance <= Math.max(1, Math.floor(q.length / 4))) score = 55 - distance * 5;
      else if (shared > 0) score = 30 + shared * 10;
      else if (symbol.description.toLowerCase().includes(q)) score = 20;
    }
    if (score > 0) matches.push({ symbol, score });
  }
  return matches
    .sort((a, b) => b.score - a.score || a.symbol.id.localeCompare(b.symbol.id))
    .slice(0, limit);
}

/** Suggestions for an unknown name, used in error messages. */
export function didYouMean(symbols: Symbol[], query: string, limit = 3): string[] {
  return searchSymbols(symbols, query, limit).map((m) => m.symbol.id);
}

/** "LeaveFormPage.submitRequest" -> ["leave", "form", "page", "submit", "request"]. */
function tokens(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+|\s+/)
    .map((t) => t.toLowerCase())
    .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0] ?? 0;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j] ?? 0;
      dp[j] = Math.min(
        (dp[j] ?? 0) + 1,
        (dp[j - 1] ?? 0) + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[b.length] ?? 0;
}
