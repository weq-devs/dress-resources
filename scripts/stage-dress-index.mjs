import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';
import { isMinimumWeqVersion } from './min-weq-version.mjs';

const kinds = ['bubble', 'font', 'widget'];
const magic = Buffer.from('NTDR\x02');
const maxRecords = 256 * 1024 ** 2;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function assertRecordFrames(raw) {
  let at = 0;
  while (at + 4 <= raw.length) {
    const length = raw.readUInt32BE(at);
    if (!length || length > raw.length - at - 4) break;
    at += 4 + length;
  }
  if (!at || at !== raw.length) throw new Error('装扮索引包含不完整的 protobuf 记录');
}

function encrypt(raw, kind, key, keyId) {
  const compressed = brotliCompressSync(raw, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 9,
      [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  });
  const header = Buffer.concat([magic, Buffer.from(keyId, 'hex')]);
  const aad = Buffer.concat([header, Buffer.from(kind)]);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce).setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Verify the exact encrypted payload staged for publication.
  const check = createDecipheriv('aes-256-gcm', key, nonce).setAAD(aad).setAuthTag(tag);
  const plain = Buffer.concat([check.update(ciphertext), check.final()]);
  if (sha256(brotliDecompressSync(plain, { maxOutputLength: maxRecords })) !== sha256(raw))
    throw new Error('装扮索引回读不一致');
  return Buffer.concat([header, nonce, ciphertext, tag]);
}

export async function stageDressIndex({ source, output, minWeqVersion, hexKey }) {
  if (!source || !output || !isMinimumWeqVersion(minWeqVersion))
    throw new Error('请指定装扮输入、输出目录和最低 WeQ 版本');
  if (!/^[a-fA-F0-9]{64}$/.test(hexKey ?? ''))
    throw new Error('需要 WEQ_DRESS_ENCRYPTION_KEY 中的 32 字节十六进制密钥');
  const key = Buffer.from(hexKey, 'hex');
  const keyId = sha256(key).slice(0, 32);
  const parts = {};
  const inputIds = [];
  await mkdir(output);
  for (const kind of kinds) {
    const path = join(source, `${kind}_resources`);
    const file = await lstat(path);
    if (!file.isFile() || !file.size || file.size > maxRecords)
      throw new Error(`装扮采集产物无效：${kind}`);
    const raw = await readFile(path);
    assertRecordFrames(raw);
    inputIds.push([kind, sha256(raw)]);
    const packed = encrypt(raw, kind, key, keyId);
    if (packed.length > 64 * 1024 ** 2) throw new Error(`装扮索引过大：${kind}`);
    const asset = `dress-${kind}.dat`;
    parts[kind] = { asset, size: packed.length, sha256: sha256(packed) };
    await writeFile(join(output, asset), packed);
  }
  const sourceVersion = sha256(JSON.stringify([keyId, minWeqVersion, inputIds]));
  const tag = `dress-index-${sourceVersion.slice(0, 20)}`;
  const format = 'ntdr-v2';
  const manifest = {
    schemaVersion: 1,
    tag,
    keyId,
    format,
    baseUrl: `https://github.com/weq-devs/dress-resources/releases/download/${tag}`,
    parts,
  };
  const contentVersion = sha256(JSON.stringify([
    ['dress', keyId, format, kinds.map((kind) => {
      const { asset, size, sha256 } = parts[kind];
      return [asset, size, sha256];
    })],
  ]));
  const pack = {
    id: 'dress',
    contentVersion,
    minWeqVersion,
    runtime: format,
    components: [{ type: 'dress', manifest }],
  };
  await writeFile(join(output, 'enhancement-dress-v2.json'), JSON.stringify({
    schemaVersion: 1,
    sourceVersion,
    packs: [pack],
  }, null, 2) + '\n');
  return tag;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      output: { type: 'string' },
      'min-weq-version': { type: 'string' },
    },
  });
  process.stdout.write(await stageDressIndex({
    ...values,
    minWeqVersion: values['min-weq-version'],
    hexKey: process.env.WEQ_DRESS_ENCRYPTION_KEY,
  }) + '\n');
}
