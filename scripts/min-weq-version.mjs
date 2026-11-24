const version = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function isMinimumWeqVersion(value) {
  if (typeof value !== 'string' || value.length > 256) return false;
  const match = version.exec(value);
  if (!match || match[0] !== value) return false;
  return (
    match.slice(1, 4).every((part) => Number.isSafeInteger(Number(part))) &&
    !match[4]?.split('.').some((part) => /^0\d+$/.test(part))
  );
}
