import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createDecipheriv, createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { inspectMarketCsv } from '../scripts/market-csv.mjs';
import { isMinimumWeqVersion } from '../scripts/min-weq-version.mjs';
import { stageDressIndex } from '../scripts/stage-dress-index.mjs';

const beta = '2.8.0-beta.1';

test('最低版本接受正式版与预发布版，拒绝无效的版本表达式', () => {
  for (const version of ['2.8.0', beta, '2.8.0-rc.2']) assert(isMinimumWeqVersion(version));
  for (const version of [undefined, '>=2.8.0', '2.08.0', '2.8.0-', '2.8.0-beta.01', '2.8.0-beta..1'])
    assert(!isMinimumWeqVersion(version));
});

test('表情目录从上一版继续，简介中的换行和逗号不影响最大 ID', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'weq-resource-catalog-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const csv = join(root, 'market.csv');
  const source = 'id,name,mark,feetype\n248001,旧包,"简介\n999999,不是包 ID",1\n248002,新包,简介,1\n';
  await writeFile(csv, source);
  assert.deepEqual(inspectMarketCsv(Buffer.from(source)), { count: 2, maxId: 248002 });
  const output = join(root, 'published');
  const pack = (directory, version) => execFileSync(process.execPath, [
    'scripts/stage-market-emoji.mjs', '--csv', csv, '--output', directory, '--min-weq-version', version,
  ], { encoding: 'utf8' }).trim();
  const tag = pack(output, beta);
  const stable = join(root, 'stable');
  assert.notEqual(pack(stable, '2.8.0'), tag);
  const base = join(output, 'market.csv.gz');
  const descriptor = JSON.parse(await readFile(join(output, 'enhancement-market-emoji.json')));
  const previous = JSON.parse(await readFile(join(stable, 'enhancement-market-emoji.json')));
  const file = await readFile(base);
  assert.equal(gunzipSync(file).toString(), source);
  const rawSha256 = createHash('sha256').update(source).digest('hex');
  const sourceVersion = createHash('sha256').update(JSON.stringify([rawSha256, beta])).digest('hex');
  assert.equal(tag, `market-emoji-${sourceVersion.slice(0, 20)}`);
  assert.equal(descriptor.packs[0].minWeqVersion, beta);
  assert.equal(descriptor.packs[0].contentVersion, previous.packs[0].contentVersion);
  assert.equal(descriptor.packs[0].components[0].asset.sha256, createHash('sha256').update(file).digest('hex'));
  assert(descriptor.packs[0].components[0].asset.url.endsWith(`/${tag}/market.csv.gz`));
  const continued = join(root, 'continued.csv');
  execFileSync(process.execPath, ['scripts/prepare-market-source.mjs', '--output', continued, '--base', base]);
  assert.equal(await readFile(continued, 'utf8'), source);
});

test('装扮新快照可用同一把密钥独立打包，三类资产绑定自身类别', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'weq-resource-dress-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'raw');
  await mkdir(source);
  const kinds = ['bubble', 'font', 'widget'];
  const key = Buffer.alloc(32, 13);
  const hexKey = key.toString('hex');
  const pack = (directory, minWeqVersion = beta) => stageDressIndex({
    source, output: join(root, directory), minWeqVersion, hexKey,
  });
  const data = (version) => Buffer.from([0, 0, 0, 2, 8, version]);
  for (const kind of kinds) await writeFile(join(source, `${kind}_resources`), data(1));
  const first = await pack('first');
  assert.equal(await pack('retry'), first);
  assert.notEqual(await pack('stable', '2.8.0'), first);
  const descriptor = JSON.parse(await readFile(join(root, 'first', 'enhancement-dress-v2.json')));
  assert.equal(descriptor.packs[0].minWeqVersion, beta);
  for (const kind of kinds) await writeFile(join(source, `${kind}_resources`), data(2));
  assert.notEqual(await pack('second'), first);
  for (const [directory, number] of [['first', 1], ['second', 2]]) {
    const raw = await readFile(join(root, directory, 'dress-font.dat'));
    assert.equal(raw.subarray(0, 5).toString('hex'), '4e54445202');
    const decrypt = (kind) => {
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(21, 33))
        .setAAD(Buffer.concat([raw.subarray(0, 21), Buffer.from(kind)]))
        .setAuthTag(raw.subarray(-16));
      return brotliDecompressSync(Buffer.concat([decipher.update(raw.subarray(33, -16)), decipher.final()]));
    };
    assert.deepEqual(decrypt('font'), data(number));
    assert.throws(() => decrypt('bubble'));
  }
});
