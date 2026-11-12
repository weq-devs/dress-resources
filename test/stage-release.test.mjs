import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PARTS, stageDressRelease } from '../scripts/stage-release.mjs';

const commit = 'a'.repeat(40);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dress-release-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const assetsDirectory = join(root, 'assets');
  await mkdir(assetsDirectory);
  const nativeManifest = { commit, dressKeySeed: commit, dress: {} };
  for (const kind of PARTS) {
    const bytes = Buffer.concat([Buffer.from('NTDR\x01'), Buffer.alloc(32, kind.length)]);
    const asset = `dress-${kind}.dat`;
    await writeFile(join(assetsDirectory, asset), bytes);
    nativeManifest.dress[kind] = {
      asset,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
    };
  }
  return { root, assetsDirectory, nativeManifest, outputDirectory: join(root, 'dist') };
}

test('只发布三份已验证的加密索引及独立清单，输出无私仓诊断字段', async (t) => {
  const f = await fixture(t);
  f.nativeManifest.privateField = 'do-not-copy';
  const manifest = await stageDressRelease(f);
  assert.equal(manifest.tag, 'dress-aaaaaaa');
  assert.equal(manifest.nativeCommit, commit);
  assert.equal(manifest.format, 'ntdr-v1');
  assert.equal(manifest.privateField, undefined);
  assert.deepEqual((await readdir(f.outputDirectory)).sort(), [
    'SHA256SUMS', 'dress-bubble.dat', 'dress-font.dat', 'dress-widget.dat', 'index-manifest.json',
  ]);
  const stored = JSON.parse(await readFile(join(f.outputDirectory, 'index-manifest.json'), 'utf8'));
  assert.deepEqual(stored, manifest);
  const sums = await readFile(join(f.outputDirectory, 'SHA256SUMS'), 'utf8');
  assert.equal(sums.trim().split('\n').length, 4);
});

for (const mode of ['hash', 'size', 'missing', 'header', 'seed', 'symlink', 'asset']) {
  test(`拒绝不完整或不匹配索引：${mode}`, async (t) => {
    const f = await fixture(t);
    const file = join(f.assetsDirectory, 'dress-bubble.dat');
    if (mode === 'hash') f.nativeManifest.dress.bubble.sha256 = '0'.repeat(64);
    if (mode === 'size') f.nativeManifest.dress.bubble.size++;
    if (mode === 'missing') await rm(file);
    if (mode === 'header') await writeFile(file, Buffer.alloc(f.nativeManifest.dress.bubble.size));
    if (mode === 'seed') f.nativeManifest.dressKeySeed = 'b'.repeat(40);
    if (mode === 'asset') f.nativeManifest.dress.bubble.asset = '../private.dat';
    if (mode === 'symlink') {
      const target = join(f.root, 'original.dat');
      await writeFile(target, await readFile(file));
      await rm(file);
      await symlink(target, file);
    }
    await assert.rejects(stageDressRelease(f));
    assert(!((await readdir(f.root)).includes('dist')));
  });
}

test('不覆盖已有发布产物', async (t) => {
  const f = await fixture(t);
  await stageDressRelease(f);
  await assert.rejects(stageDressRelease(f));
  assert.equal((await readdir(f.outputDirectory)).length, 5);
});
