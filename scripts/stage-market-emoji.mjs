import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { inspectMarketCsv, MAX_MARKET_BYTES } from './market-csv.mjs';

const { values } = parseArgs({
  options: {
    csv: { type: 'string' },
    output: { type: 'string' },
    'min-weq-version': { type: 'string' },
  },
});
const { csv, output, 'min-weq-version': minWeqVersion } = values;
if (!csv || !output || !/^\d+\.\d+\.\d+$/.test(minWeqVersion ?? ''))
  throw new Error('请指定 CSV、输出目录和最低 WeQ 版本');

const file = await lstat(csv);
if (!file.isFile() || file.size > MAX_MARKET_BYTES)
  throw new Error('商城表情目录文件无效');
const csvBytes = await readFile(csv);
inspectMarketCsv(csvBytes);
const data = gzipSync(csvBytes, { level: 9 });

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const name = 'market.csv.gz';
const digest = sha256(data);
const sourceVersion = sha256(JSON.stringify([sha256(csvBytes), minWeqVersion]));
const tag = `market-emoji-${sourceVersion.slice(0, 20)}`;
const asset = {
  name,
  url: `https://github.com/weq-devs/dress-resources/releases/download/${tag}/${name}`,
  sizeBytes: data.length,
  sha256: digest,
};
const pack = {
  id: 'market-emoji',
  contentVersion: sha256(JSON.stringify([['market-emoji', name, data.length, digest]])),
  minWeqVersion,
  runtime: 'market-csv-gzip-v1',
  components: [{ type: 'market-emoji', asset }],
};
await mkdir(output);
await writeFile(join(output, name), data);
await writeFile(
  join(output, 'enhancement-market-emoji.json'),
  `${JSON.stringify({ schemaVersion: 1, sourceVersion, packs: [pack] }, null, 2)}\n`,
);
process.stdout.write(`${tag}\n`);
