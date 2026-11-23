import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const descriptors = {
  dress: 'enhancement-dress-v2.json',
  'market-emoji': 'enhancement-market-emoji.json',
};
const repository = 'weq-devs/dress-resources';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function run(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 8 * 1024 ** 2 });
}
const tracks = process.argv.slice(2);
if (!tracks.length || new Set(tracks).size !== tracks.length || tracks.some((track) => !Object.hasOwn(descriptors, track)))
  throw new Error('请选择要发布的增强包');
const releases = JSON.parse(run(['api', `repos/${repository}/releases?per_page=100`]));
const tags = [];
for (const track of tracks) {
  const directory = join('dist', track);
  const descriptor = descriptors[track];
  const manifestPath = join(directory, descriptor);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const { sourceVersion, packs } = manifest;
  const component = packs?.[0]?.components?.[0];
  const prefix = track === 'dress' ? 'dress-index' : 'market-emoji';
  if (!/^[a-f0-9]{64}$/.test(sourceVersion) || component?.type !== track)
    throw new Error('暂存的资源描述无效');
  const tag = `${prefix}-${sourceVersion.slice(0, 20)}`;
  const entries = (component) => component.type === 'dress'
    ? Object.values(component.manifest.parts).map(({ asset, size, sha256 }) => ({ name: asset, size, sha256 }))
    : [{ name: component.asset.name, size: component.asset.sizeBytes, sha256: component.asset.sha256 }];
  const assets = entries(component);
  const names = track === 'dress' ? ['dress-bubble.dat', 'dress-font.dat', 'dress-widget.dat'] : ['market.csv.gz'];
  if (JSON.stringify(assets.map((item) => item.name).sort()) !== JSON.stringify(names))
    throw new Error('资源包暂存文件清单无效');
  for (const asset of assets) {
    const path = join(directory, asset.name);
    const info = await lstat(path);
    if (!info.isFile() || info.size !== asset.size || sha256(await readFile(path)) !== asset.sha256)
      throw new Error(`待上传资源不匹配：${asset.name}`);
  }

  const existing = releases.find((release) => release.tag_name === tag);
  const title = `WeQ 资源增强包 ${tag}`;
  if (existing && !existing.draft) {
    const metadata = existing.assets.find((asset) => asset.name === descriptor);
    if (!metadata || !existing.published_at || existing.prerelease)
      throw new Error('已有 Release 与资源发布身份不匹配');
    const receiptText = run(['api', '-H', 'Accept: application/octet-stream',
      `repos/${repository}/releases/assets/${metadata.id}`]);
    if (Buffer.byteLength(receiptText) !== metadata.size || metadata.digest !== `sha256:${sha256(receiptText)}`)
      throw new Error('已有 Release 清单摘要不匹配');
    const receipt = JSON.parse(receiptText);
    if (receipt.sourceVersion !== sourceVersion || receipt.packs?.[0]?.components?.[0]?.type !== track ||
        entries(receipt.packs[0].components[0]).some((file) => !existing.assets.some((asset) =>
          asset.name === file.name && asset.size === file.size && asset.digest === `sha256:${file.sha256}`)))
      throw new Error('已有 Release 资源与发布描述不一致');
  } else {
    if (existing && existing.name !== title) throw new Error('已有草稿与工作流发布身份不匹配');
    if (!existing)
      run(['release', 'create', tag, '--repo', repository, '--draft', '--target', process.env.GITHUB_SHA,
        '--latest=false', '--title', title, '--notes', '由 WeQ 资源增强包工作流发布。']);
    run(['release', 'upload', tag, '--repo', repository, '--clobber', manifestPath,
      ...names.map((name) => join(directory, name))]);
    run(['release', 'edit', tag, '--repo', repository, '--draft=false', '--latest=false']);
  }
  tags.push(tag);
}
process.stdout.write(tags.join(',') + '\n');
