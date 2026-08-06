/**
 * 행사 레코드 스키마. src/data.js 의 events 항목이 실제로 갖는 모양을 그대로 적었다.
 *
 * 이 파일은 두 곳에서 쓴다.
 *   1. bot/extract.mjs — 모델에게 넘길 출력 스키마
 *   2. tools/verify-source.mjs — 들어온 레코드 검사
 *
 * 검사는 "채워도 되는 칸"을 좁히는 쪽으로 짰다. 모르는 값은 null 이어야 하고,
 * 추정한 값을 넣을 자리는 아예 없다.
 */

export const KINDS = ['talk', 'roundtable', 'party', 'walk', 'network', 'private'];
export const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 모델에 그대로 넘기는 JSON Schema. 여기 없는 키는 뱉지 못한다. */
export const EVENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'date', 'title', 'short', 'kind', 'lang', 'paid'],
  properties: {
    id: { type: 'string', pattern: '^[0-9]{4}[a-z]?$', description: 'MMDD. 같은 날 두 건이면 뒤에 b, c' },
    /* 장소가 공지되지 않은 회차가 실제로 있다. 모르면 null 로 두고 추정하지 않는다 */
    venueKey: { type: ['string', 'null'], description: '장소 축약 이름. 통계의 장소별 집계 키' },
    date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
    dow: { type: ['string', 'null'], description: 'date 에서 계산한다. 직접 쓰지 않는다' },
    month: { type: ['string', 'null'], description: 'date 에서 계산한다. 직접 쓰지 않는다' },
    title: { type: 'string' },
    short: { type: 'string', description: '달력 툴팁에 들어갈 짧은 이름' },
    venue: { type: ['string', 'null'] },
    floor: { type: ['string', 'null'] },
    time: { type: ['string', 'null'] },
    sponsors: { type: 'array', items: { type: 'string' } },
    applicants: { type: ['integer', 'null'] },
    applicantsNote: { type: ['string', 'null'] },
    attendees: { type: ['integer', 'null'] },
    attendeesNote: { type: ['string', 'null'] },
    capacity: { type: ['integer', 'null'] },
    format: { type: ['string', 'null'] },
    lang: { type: 'string', enum: ['ko', 'en', 'ko/en'] },
    paid: { type: 'boolean' },
    kind: { type: 'string', enum: KINDS },
    firsts: { type: 'array', items: { type: 'string' }, description: '이 회차에서 처음 있었던 운영상의 변화' },
    speakers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['n', 'a'],
        properties: { n: { type: 'string' }, a: { type: 'string', description: '소속·직함·역할' } },
      },
    },
    summary: { type: 'array', items: { type: 'string' } },
    body: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['h'],
        properties: {
          h: { type: 'string' },
          p: { type: 'string' },
          table: {
            type: 'object',
            additionalProperties: false,
            required: ['head', 'rows'],
            properties: {
              head: { type: 'array', items: { type: 'string' } },
              rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
            },
          },
        },
      },
    },
    quotes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['t', 's'],
        properties: {
          t: { type: 'string', description: '원문 그대로. 한 글자도 고치지 않는다' },
          s: { type: 'string', description: '발화자. 연사면 이름·소속, 참석자면 직군·소속만' },
          pin: { type: 'boolean' },
        },
      },
    },
    tables: { type: 'array', items: { type: 'object' } },
    retro: { type: ['string', 'null'] },
    feedback: { type: 'array', items: { type: 'string' } },
    actions: { type: 'array', items: { type: 'string' } },
    links: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['l', 'u'],
        properties: { l: { type: 'string' }, u: { type: 'string' } },
      },
    },
    note: { type: ['string', 'null'] },
    tags: { type: 'array', items: { type: 'string' } },
    /* 화면 상태 표시용 플래그. 봇이 쓸 일은 없고 사람이 손으로 붙인다 */
    hasRetro: { type: 'boolean' },
    today: { type: 'boolean' },
    upcoming: { type: 'boolean' },
  },
};

export const PATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['events', 'skipped'],
  properties: {
    events: { type: 'array', items: EVENT_SCHEMA },
    skipped: {
      type: 'array',
      description: '기록으로 세우기에 근거가 모자란 것들. 왜 넘겼는지 적는다',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['what', 'why'],
        properties: { what: { type: 'string' }, why: { type: 'string' } },
      },
    },
  },
};

/** 스키마 위반을 문자열 배열로 돌려준다. 빈 배열이면 통과. */
export function validateEvent(e, ctx = '') {
  const bad = [];
  const at = k => `${ctx}${e?.id ? `[${e.id}]` : ''}.${k}`;

  if (!e || typeof e !== 'object') return [`${ctx} 레코드가 객체가 아니다`];
  for (const k of EVENT_SCHEMA.required) if (e[k] === undefined || e[k] === null) bad.push(`${at(k)} 누락`);
  for (const k of Object.keys(e)) if (!EVENT_SCHEMA.properties[k]) bad.push(`${at(k)} 알 수 없는 필드`);

  if (e.id && !/^[0-9]{4}[a-z]?$/.test(e.id)) bad.push(`${at('id')} 형식이 MMDD 가 아니다: ${e.id}`);
  if (e.date && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) bad.push(`${at('date')} 형식 오류: ${e.date}`);
  if (e.date && e.id && e.id.slice(0, 4) !== e.date.slice(5).replace('-', ''))
    bad.push(`${at('id')} 가 date 와 어긋난다 (${e.id} vs ${e.date})`);
  if (e.date && e.dow) {
    const real = DOW[new Date(`${e.date}T00:00:00Z`).getUTCDay()];
    if (real !== e.dow) bad.push(`${at('dow')} 요일이 틀렸다 (${e.dow}, 실제 ${real})`);
  }
  if (e.date && e.month && e.month !== e.date.slice(5, 7)) bad.push(`${at('month')} 가 date 와 어긋난다`);
  if (e.kind && !KINDS.includes(e.kind)) bad.push(`${at('kind')} 알 수 없는 값: ${e.kind}`);
  if (e.short && [...e.short].length > 30) bad.push(`${at('short')} 가 30자를 넘는다 — 달력 툴팁이 깨진다`);

  for (const n of ['applicants', 'attendees', 'capacity']) {
    const v = e[n];
    if (v === undefined || v === null) continue;
    if (!Number.isInteger(v) || v < 0 || v > 100000) bad.push(`${at(n)} 값이 이상하다: ${v}`);
  }
  if (Number.isInteger(e.attendees) && Number.isInteger(e.applicants) && e.attendees > e.applicants)
    bad.push(`${at('attendees')} 가 applicants 보다 많다 — 둘을 바꿔 넣지 않았는지 볼 것`);

  (e.quotes || []).forEach((q, i) => {
    if (!q.t?.trim()) bad.push(`${at(`quotes[${i}].t`)} 가 비었다`);
    if (!q.s?.trim()) bad.push(`${at(`quotes[${i}].s`)} 가 비었다`);
  });
  (e.body || []).forEach((b, i) => {
    if (!b.h?.trim()) bad.push(`${at(`body[${i}].h`)} 가 비었다`);
    if (!b.p && !b.table) bad.push(`${at(`body[${i}]`)} 에 p 도 table 도 없다`);
  });
  (e.links || []).forEach((l, i) => {
    if (!/^https?:\/\//.test(l.u || '')) bad.push(`${at(`links[${i}].u`)} 가 URL 이 아니다: ${l.u}`);
  });

  return bad;
}

/** 파생 필드(dow, month)를 date 에서 채운다. 모델이 계산하게 두지 않는다. */
export function derive(e) {
  const d = new Date(`${e.date}T00:00:00Z`);
  return { ...e, dow: DOW[d.getUTCDay()], month: e.date.slice(5, 7) };
}
