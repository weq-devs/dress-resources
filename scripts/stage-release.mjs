import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PARTS = ['bubble', 'widget', 'font'];

export async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyPart(path, meta, kind) {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    meta?.asset !== `dress-${kind}.dat` ||
    !/^[a-f0-9]{64}$/.test(meta.sha256 ?? '') ||
    !Number.isSafeInteger(meta.size) ||
    meta.size <= 21 ||
    info.size !== meta.size
  )
    throw new Error(`装扮索引的文件、名称或体积不合法：${kind}`);
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(5);
    await handle.read(header, 0, header.length, 0);
    if (!header.equals(Buffer.from([0x4e, 0x54, 0x44, 0x52, 1])))
      throw new Error(`不支持的装扮索引格式：${kind}`);
  } finally {
    await handle.close();
  }
  if ((await hashFile(path)) !== meta.sha256) throw new Error(`装扮索引摘要不匹配：${kind}`);
}

export async function stageDressRelease({
  nativeManifest,
  assetsDirectory,
  outputDirectory,
  tag,
  repository = 'weq-devs/dress-resources',
}) {
  if (!/^[a-f0-9]{40}$/.test(nativeManifest?.commit ?? ''))
    throw new Error('native 来源缺少完整 commit');
  tag ??= `dress-${nativeManifest.commit.slice(0, 7)}`;
  if (!/^dress-[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(tag)) throw new Error('资源 tag 不合法');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('资源仓标识不合法');
  if (nativeManifest.dressKeySeed !== nativeManifest.commit)
    throw new Error('native 的资源密钥标识与来源 commit 不一致');
  const parts = {};
  for (const kind of PARTS) {
    const meta = nativeManifest.dress?.[kind];
    if (!meta) throw new Error(`native 发布清单缺少资源：${kind}`);
    await verifyPart(join(assetsDirectory, `dress-${kind}.dat`), meta, kind);
    parts[kind] = { asset: meta.asset, sha256: meta.sha256, size: meta.size };
  }
  const manifest = {
    schemaVersion: 1,
    tag,
    nativeCommit: nativeManifest.commit,
    format: 'ntdr-v1',
    baseUrl: `https://github.com/${repository}/releases/download/${tag}`,
    parts,
  };
  try {
    await lstat(outputDirectory);
    throw new Error('输出目录已存在，不覆盖已有发布产物');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(outputDirectory), { recursive: true });
  const staging = await mkdtemp(join(dirname(outputDirectory), '.dress-release-'));
  try {
    for (const kind of PARTS) {
      const { asset } = parts[kind];
      await copyFile(join(assetsDirectory, asset), join(staging, asset), constants.COPYFILE_FICLONE);
      await verifyPart(join(staging, asset), parts[kind], kind);
    }
    await writeFile(join(staging, 'index-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const hashes = PARTS.map((kind) => `${parts[kind].sha256}  ${parts[kind].asset}`);
    hashes.push(`${await hashFile(join(staging, 'index-manifest.json'))}  index-manifest.json`);
    await writeFile(join(staging, 'SHA256SUMS'), `${hashes.sort().join('\n')}\n`);
    // 不覆盖已有产物目录，防止把不同内容误发布到同一版本。
    await rename(staging, outputDirectory);
    return manifest;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (key) => {
    const index = args.indexOf(key);
    return index < 0 ? undefined : args[index + 1];
  };
  if (args.includes('--help')) {
    console.log('node scripts/stage-release.mjs --native-manifest <文件> --assets <目录> --output <新目录> [--tag dress-...]');
  } else {
    try {
      if (!opt('--native-manifest') || !opt('--assets') || !opt('--output'))
        throw new Error('必须指定 --native-manifest、--assets 和 --output');
      const manifest = await stageDressRelease({
        nativeManifest: JSON.parse(await readFile(resolve(opt('--native-manifest')), 'utf8')),
        assetsDirectory: resolve(opt('--assets')),
        outputDirectory: resolve(opt('--output')),
        tag: opt('--tag'),
        repository: opt('--repository'),
      });
      console.log(`已验证 ${manifest.tag}：三类独立索引，兼容 native ${manifest.nativeCommit}`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
