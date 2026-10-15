import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {checkedDelay, windowIdentity, matchRule, remainingLockMillis} from '../extension/identity.js';

test('normal app uses desktop identity', () => {
  const id = windowIdentity('org.gnome.Nautilus', 'org.gnome.Nautilus', 'org.gnome.Nautilus.desktop');
  assert.equal(id.primary, 'desktop:org.gnome.Nautilus.desktop');
  assert.equal(matchRule(id, ['desktop:org.gnome.Nautilus.desktop']), true);
});
test('chrome web app uses WM_CLASS identity rather than Chrome global desktop id', () => {
  const id = windowIdentity('crx_jibnbgjiaafnkgc', 'crx_jibnbgjiaafnkgc', 'google-chrome.desktop');
  assert.equal(id.primary, 'wmclass:crx_jibnbgjiaafnkgc');
  assert.equal(matchRule(id, ['desktop:firefox.desktop']), false);
});
test('different Chrome PWA is not caught by the first PWA rule', () => {
  const first = windowIdentity('crx_abcdabcdabcd', '', 'google-chrome.desktop');
  const second = windowIdentity('crx_efghefghefgh', '', 'google-chrome.desktop');
  assert.equal(matchRule(second, [first.primary]), false);
});
test('fallback handles standalone X11 windows', () => {
  const id = windowIdentity('Pavucontrol', 'pavucontrol', null);
  assert.equal(id.primary, 'wmclass:pavucontrol');
  assert.equal(matchRule(id, [id.primary]), true);
});
test('delay is five second step 0..120; rejects values outside', () => {
  for (let n = 0; n <= 120; n += 5) assert.equal(checkedDelay(n), n);
  for (const invalid of [-1, 3, 121, 124, NaN, Infinity, 'ten'])
    assert.equal(checkedDelay(invalid), 0);
});

test('focus-away countdown locks on exact deadline and honours 5-second increments', () => {
  assert.equal(remainingLockMillis(1_000_000, 1_000_000, 0), 0);
  assert.equal(remainingLockMillis(1_000_000, 1_000_000, 10), 10000);
  assert.equal(remainingLockMillis(1_000_000, 6_000_000, 10), 5000);
  assert.equal(remainingLockMillis(1_000_000, 11_000_000, 10), 0);
  assert.equal(remainingLockMillis(1_000_000, 13_000_000, 10), 0);
  assert.equal(remainingLockMillis(1_000_000, 1_000_000, 120), 120000);
  assert.equal(remainingLockMillis(1_000_000, 1_000_001, 5), 5000);
});
