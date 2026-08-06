/**
 * 객체를 src/data.js 의 문법·스타일 그대로 찍어 낸다.
 *
 * JSON.stringify 로도 유효한 JS 가 나오지만, 이 파일의 diff 는 사람이 읽고 머지한다.
 * 기존 항목과 표기가 다르면 리뷰가 어려워지므로 홑따옴표·따옴표 없는 키를 맞춘다.
 */

const SAFE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const str = s =>
  "'" +
  String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n') +
  "'";

const isPrimitiveArray = v =>
  Array.isArray(v) && v.every(x => typeof x !== 'object' || x === null);

/** 한 줄로 찍었을 때 이 길이 안이면 접지 않는다 */
const INLINE = 96;

export function emit(value, indent = 0) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);

  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return str(value);

  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const parts = value.map(v => emit(v, indent + 1));
    const one = `[${parts.join(', ')}]`;
    if (isPrimitiveArray(value) && pad.length + one.length <= INLINE) return one;
    return `[\n${parts.map(p => padIn + p).join(',\n')},\n${pad}]`;
  }

  const keys = Object.keys(value).filter(k => value[k] !== undefined);
  if (!keys.length) return '{}';
  const parts = keys.map(k => `${SAFE_KEY.test(k) ? k : str(k)}: ${emit(value[k], indent + 1)}`);
  const one = `{ ${parts.join(', ')} }`;
  if (!one.includes('\n') && pad.length + one.length <= INLINE) return one;
  return `{\n${parts.map(p => padIn + p).join(',\n')},\n${pad}}`;
}
