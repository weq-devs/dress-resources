import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { inspectMarketCsv, MAX_MARKET_BYTES } from './market-csv.mjs';

const repo = 'weq-devs/dress-resources';
const releases = `https://github.com/${repo}/releases/download`;
const seed = new URL('../resources/market-seed.csv.gz', import.meta.url);

async function readAsset(url, limit, missingOk = false) {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (missingOk && res.status === 404) return null;
  if (!res.ok || !res.body) throw new Error(`目录来源下载失败（HTTP ${res.status}）`);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of res.body) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error('目录来源超出允许的长度');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function previousCatalog(tools) {
  const network = join(resolve(tools), 'packages/network/src');
  const { FEED_ASSET, RESOURCE_FEED_TAG, verifyReleaseIndex } =
    await import(pathToFileURL(join(network, 'release_metadata.mjs')).href);
  const bytes = await readAsset(`${releases}/${RESOURCE_FEED_TAG}/${FEED_ASSET}`, 8 * 1024 ** 2, true);
  if (!bytes) return null;
  const publicKeys = JSON.parse(await readFile(join(network, 'release_keys.json'), 'utf8'));
  const index = verifyReleaseIndex(JSON.parse(bytes), repo, publicKeys);
  if (index.kind !== 'resource-release-index') throw new Error('资源更新索引类型不匹配');
  const entry = index.releases.find((release) => release.track === 'market-emoji' && !release.prerelease);
  if (!entry) return null;
  const asset = entry.assets.find((asset) => asset.name === 'market.csv.gz');
  if (!asset || asset.size > MAX_MARKET_BYTES) throw new Error('已发布表情目录资产无效');
  const data = await readAsset(`${releases}/${entry.tag}/${asset.name}`, asset.size);
  if (data.length !== asset.size || createHash('sha256').update(data).digest('hex') !== asset.sha256)
    throw new Error('已发布表情目录与签名索引不一致');
  return data;
}

const { values } = parseArgs({
  options: { output: { type: 'string' }, base: { type: 'string' }, tools: { type: 'string' } },
});
if (!values.output || (values.base && values.tools))
  throw new Error('指定 --output，可选 --base <本地 gzip> 或 --tools <WeQ 工具目录> 续作');
const prior = values.base ? await readFile(values.base) : values.tools ? await previousCatalog(values.tools) : null;
const csv = gunzipSync(prior ?? await readFile(seed), { maxOutputLength: MAX_MARKET_BYTES });
const { count, maxId } = inspectMarketCsv(csv);
await mkdir(dirname(values.output), { recursive: true });
await writeFile(values.output, csv, { flag: 'wx' });
console.log(`${prior ? '上版目录' : '首次发布目录'}：${count} 套，最大 ID ${maxId}`);
