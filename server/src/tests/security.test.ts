/** security.test.ts — Phase 5: envelope crypto, idempotency keys, ABAC, sessions. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnvelopeCipher, ctEqual } from '../security/envelope.js';
import { IdempotencyKeyer } from '../security/idempotency.js';
import { PORTFOLIO_POLICIES, evaluate } from '../security/abac.js';
import { SessionRegistry } from '../security/sessions.js';

test('envelope: encrypt → decrypt round-trip with AAD binding', () => {
  const cipher = EnvelopeCipher.masterFromSecret('a'.repeat(40));
  const secret = Buffer.from('سجل مالي حساس — 12345.67 EGP');
  const env = cipher.encrypt(secret, Buffer.from('ctx-1'));
  assert.notDeepEqual(env.ciphertext, secret);
  assert.equal(cipher.decrypt(env, Buffer.from('ctx-1')).toString('utf8'), secret.toString('utf8'));
});

test('envelope: tampered ciphertext / wrong AAD / wrong master all FAIL', () => {
  const cipher = EnvelopeCipher.masterFromSecret('b'.repeat(40));
  const env = cipher.encrypt(Buffer.from('payload'), Buffer.from('ctx'));

  const tampered = { ...env, ciphertext: Buffer.from(env.ciphertext) };
  (tampered.ciphertext as Buffer)[0] = ((tampered.ciphertext[0] ?? 0) ^ 0xff) as never;
  assert.throws(() => cipher.decrypt(tampered, Buffer.from('ctx')));
  assert.throws(() => cipher.decrypt(env, Buffer.from('other-context')));

  const otherMaster = EnvelopeCipher.masterFromSecret('c'.repeat(40));
  assert.throws(() => otherMaster.decrypt(env, Buffer.from('ctx')));
});

test('envelope: every encryption uses a fresh DEK and IV', () => {
  const cipher = EnvelopeCipher.masterFromSecret('d'.repeat(40));
  const e1 = cipher.encrypt(Buffer.from('same'));
  const e2 = cipher.encrypt(Buffer.from('same'));
  assert.notDeepEqual(e1.ciphertext, e2.ciphertext);
  assert.notDeepEqual(e1.iv, e2.iv);
  assert.notDeepEqual(e1.wrappedDek, e2.wrappedDek);
});

test('ctEqual: constant-time equality semantics', () => {
  assert.equal(ctEqual(Buffer.from('abc'), Buffer.from('abc')), true);
  assert.equal(ctEqual(Buffer.from('abc'), Buffer.from('abd')), false);
  assert.equal(ctEqual(Buffer.from('abc'), Buffer.from('ab')), false); // O(1) length reject
});

test('idempotency: deterministic per operation, diverges on mutation', () => {
  const keyer = new IdempotencyKeyer(Buffer.from('x'.repeat(32)));
  const payload = Buffer.from(JSON.stringify({ amount: 100 }));
  const k1 = keyer.issue('t', 'transfer', payload);
  const k2 = keyer.issue('t', 'transfer', payload);
  assert.equal(k1, k2, 'same operation ⇒ same key (safe retries)');
  assert.notEqual(k1, keyer.issue('t', 'transfer', Buffer.from(JSON.stringify({ amount: 101 }))));
  assert.notEqual(k1, keyer.issue('other-tenant', 'transfer', payload));
  assert.equal(keyer.verify('t', 'transfer', payload, k1), true);
  assert.equal(keyer.verify('t', 'transfer', payload, k1.slice(0, -1) + 'A'), false);
});

test('ABAC: deny-overrides + default-deny + owner match', () => {
  const base = { environment: {} };
  assert.equal(
    evaluate(PORTFOLIO_POLICIES, { ...base, subject: { role: 'admin', verified: true }, action: 'transfer', resource: {} }),
    'allow',
  );
  // unverified admin hits the explicit DENY despite matching the allow rule
  assert.equal(
    evaluate(PORTFOLIO_POLICIES, { ...base, subject: { role: 'admin', verified: false }, action: 'transfer', resource: {} }),
    'deny',
  );
  // unknown subject → default deny
  assert.equal(
    evaluate(PORTFOLIO_POLICIES, { ...base, subject: { role: 'guest' }, action: 'read', resource: {} }),
    'deny',
  );
  // owner-scoped read
  assert.equal(
    evaluate(PORTFOLIO_POLICIES, {
      ...base, subject: { role: 'owner', id: 'u1' }, action: 'read', resource: { ownerId: 'u1' },
    }),
    'allow',
  );
  assert.equal(
    evaluate(PORTFOLIO_POLICIES, {
      ...base, subject: { role: 'owner', id: 'u1' }, action: 'read', resource: { ownerId: 'u2' },
    }),
    'deny',
  );
  // owners can never write
  assert.equal(
    evaluate(PORTFOLIO_POLICIES, {
      ...base, subject: { role: 'owner', id: 'u1' }, action: 'transfer', resource: { ownerId: 'u1' },
    }),
    'deny',
  );
});

test('sessions: WeakMap registry — resolve, revoke, no retained pins', () => {
  const reg = new SessionRegistry();
  const s = { tenant: 'A', subjectId: 'amr', role: 'admin', issuedAt: Date.now() };
  reg.issue('tok-1', s);
  const got = reg.resolve('tok-1');
  assert.ok(got !== undefined);
  assert.equal(got.session.tenant, 'A');
  reg.revoke('tok-1');
  assert.equal(reg.resolve('tok-1'), undefined);
  assert.equal(reg.indexedTokens, 0);
});
