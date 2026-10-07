/**
 * security/abac.ts — Attribute-Based Access Control engine (Phase 5).
 *
 * Declarative rules over flat attribute bags; NO code in policies (they can
 * be serialized, audited, versioned). Semantics: deny-overrides → if any
 * DENY rule matches, the decision is deny; otherwise at least one ALLOW
 * must match; the default is DENY. RLS in the database is the second,
 * independent enforcement layer — the API and the storage each say "no"
 * on their own.
 *
 * @complexity evaluate: Time O(rules × attrs), Space O(1).
 */

export type AttrValue = string | number | boolean;
export type Attrs = Record<string, AttrValue>;

export interface AbacRequest {
  readonly subject: Attrs;
  readonly action: string;
  readonly resource: Attrs;
  readonly environment?: Attrs;
}

export interface AbacRule {
  readonly id: string;
  readonly effect: 'allow' | 'deny';
  /** Exact-match required subject attributes. */
  readonly subjectEquals?: Attrs;
  /** Actions this rule applies to ('*' = any). */
  readonly actions: readonly string[];
  /** When true, subject.id must equal resource.ownerId. */
  readonly requireOwnerMatch?: boolean;
}

function matchesAttrs(required: Attrs, actual: Attrs): boolean {
  for (const [k, v] of Object.entries(required)) {
    if (actual[k] !== v) return false;
  }
  return true;
}

/**
 * Evaluate one request against a policy set. Deterministic, allocation-light.
 * @complexity O(rules × attrs per rule).
 */
export function evaluate(rules: readonly AbacRule[], req: AbacRequest): 'allow' | 'deny' {
  let allowed = false;
  for (const rule of rules) {
    if (!(rule.actions.includes('*') || rule.actions.includes(req.action))) continue;
    if (rule.subjectEquals !== undefined && !matchesAttrs(rule.subjectEquals, req.subject)) continue;
    if (rule.requireOwnerMatch === true && req.subject['id'] !== req.resource['ownerId']) continue;
    if (rule.effect === 'deny') return 'deny'; // deny-overrides, immediate
    allowed = true;
  }
  return allowed ? 'allow' : 'deny'; // default-deny
}

/** The sovereign portfolio policy set (single-admin system). */
export const PORTFOLIO_POLICIES: readonly AbacRule[] = [
  {
    id: 'admin-all',
    effect: 'allow',
    subjectEquals: { role: 'admin', verified: true },
    actions: ['*'],
  },
  {
    id: 'owner-read',
    effect: 'allow',
    subjectEquals: { role: 'owner' },
    actions: ['read', 'list'],
    requireOwnerMatch: true,
  },
  {
    id: 'deny-unverified-admin',
    effect: 'deny',
    subjectEquals: { verified: false },
    actions: ['*'],
  },
];
