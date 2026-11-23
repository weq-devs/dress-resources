export const MAX_MARKET_BYTES = 16 * 1024 ** 2;

/** Validate the current snapshot before scanning above its largest package ID. */
export function inspectMarketCsv(bytes) {
  if (bytes.length > MAX_MARKET_BYTES) throw new Error('商城表情目录过大');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const header = /^id,name,mark,feetype(?:\r\n|\n|\r)/.exec(text);
  if (!header) throw new Error('商城表情目录表头无效');
  const field = /("(?:[^"]|"")*"|[^"\r\n,]*)(,|\r\n|\n|\r|$)/y;
  const ids = new Set();
  let maxId = 0;
  field.lastIndex = header[0].length;
  while (field.lastIndex < text.length) {
    const row = [];
    for (let column = 0; column < 4; column++) {
      const match = field.exec(text);
      if (!match || (match[2] === ',') !== (column < 3))
        throw new Error('商城表情目录存在不完整条目');
      row.push(match[1]);
    }
    const id = Number(row[0]);
    if (!/^\d+$/.test(row[0]) || !Number.isSafeInteger(id) || id < 1 || ids.has(id))
      throw new Error('商城表情目录包 ID 无效或重复');
    ids.add(id);
    maxId = Math.max(maxId, id);
  }
  if (!ids.size) throw new Error('商城表情目录为空');
  return { maxId, count: ids.size };
}
