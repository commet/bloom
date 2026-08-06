# Bloom 아카이브

Bloom 커뮤니티의 2026년 4월 14일 – 8월 6일 기록을 한 페이지로 모은 것. 행사 26회(예정 1건 포함),
연사 발언, 조별 정리, 운영진 공개 회고를 날짜·요일 달력과 차트로 보여주고, 칸을 누르면 그날 기록
전체가 드로어로 열린다.

결과물은 자체 완결형 단일 파일 `dist/index.html` — 외부 요청이 하나도 없다. 폰트까지 인라인돼 있어
파일 하나만 열면 그대로 동작한다.

## 배포 (Vercel)

**푸시하면 자동 배포된다.** 최초 1회만 vercel.com/new 에서 이 저장소를 Import 하면 되고,
그다음부터는 프로덕션 브랜치에 푸시할 때마다 Vercel 이 배포한다.

`vercel.json` 에 설치·빌드 명령이 **빈 문자열**로 지정돼 있어 Vercel 은 아무것도 빌드하지 않고
`dist/` 를 그대로 서빙한다. `null` 은 "빌드 없음"이 아니라 "자동 감지"라서, 그대로 두면 Vercel 이
`npm run build` 를 실행하다 실패한다.

```json
{ "installCommand": "", "buildCommand": "", "outputDirectory": "dist" }
```

`dist/index.html` 은 폰트까지 인라인된 완성본이라 외부 요청이 0건이고, 별도 CDN 설정이 필요 없다.

### 주의 — 빌드는 로컬에서 한다

배포 산출물을 저장소에 커밋하는 방식이므로, `src/` 만 고치고 푸시하면 배포에 반영되지 않는다.

```bash
FONTS_DIR=... node build.mjs && git add dist/index.html
```

`.github/workflows/dist-freshness.yml` 이 소스만 바뀐 푸시를 실패시켜 이 실수를 막는다.
폰트 원본은 `assets/fonts/` 에 커밋돼 있으므로 `FONTS_DIR` 없이도 같은 결과가 나온다.

## 만들기

```bash
node build.mjs                          # 시스템 폰트 스택으로 빌드
FONTS_DIR=/path/to/fonts node build.mjs # 웹폰트를 서브셋해 인라인
```

`FONTS_DIR`는 [fontsource](https://fontsource.org) woff2 트리를 가리킨다:

```
FONTS_DIR/archivo/archivo-latin-standard-normal.woff2    # 가변 — wght 100–900, wdth 62–125
FONTS_DIR/gothic/gothic-a1-<n>-<weight>-normal.woff2
```

```bash
npm pack @fontsource-variable/archivo @fontsource/gothic-a1   # 원본 받기
pip install fonttools brotli                                  # 서브셋에 필요
```

빌드는 최종 마크업에 남는 글자만 골라 폰트를 자르고, fontsource가 100조각으로 쪼개 배포하는
Gothic A1을 하나로 병합한다 (조각별 오버헤드가 사라져 175KB → 55KB). Archivo는 가변 축을
그대로 유지한 채 잘라낸다.

## 링크 미리보기

카카오톡·슬랙·X 에서 링크를 펼쳤을 때 보이는 카드는 `dist/og.png` (1200×630) 다. 실제 페이지를
열어 달력을 그대로 다시 그려 만들기 때문에, 데이터가 바뀌면 이미지도 따라 바뀐다.

```bash
node build.mjs && node tools/og.mjs && git add dist/og.png
```

OG 메타의 URL 은 절대 경로여야 스크레이퍼가 안전하게 가져간다. 배포 도메인이 정해지면 넣어서
다시 빌드한다. 넣지 않으면 루트 상대 경로(`/og.png`)로 남는다.

```bash
SITE_URL=https://<도메인> FONTS_DIR=... node build.mjs
```

## 회고 모임용 「당신의 한 줄」 (`/line`)

2026.08.06 회고 모임의 마지막 순서용 페이지. QR 로 들어와 **오늘 조에서 가져갈 한 줄**을
적으면, 그 줄이 26회 기록의 다섯 갈래 중 어디에 놓이는지와 그 갈래의 과거 문장들을
날짜·출처와 함께 보여준다. 어느 갈래에도 안 걸리면 "26회 기록에 없던 말"이 된다.

- **각자 가져가는 것** — 카드를 PNG 로 저장한다.
- **운영진이 가져가는 것** — 질문을 더 던지지 않고 같은 입력에서 나온다. 발표자 화면의
  「운영진용 한 장 복사」가 갈래별 분포와 *기록에 없던 말* 목록을 클립보드에 담는다.
  사람은 남지 않고 줄만 남는다.

`?screen` 을 붙이면 발표자 화면이다 — 아카이브와 같은 시간축에 다섯 갈래 트랙을 깔고,
4개월치 문장이 회색 점으로 이미 찍혀 있는 위로 오늘 올라온 줄이 하나씩 얹힌다.
프로젝터가 없으면 각자 폰에서 같은 목록을 본다.

갈래 정의는 `src/lineage.js` 에 있다. `lines[].t` 는 전부 `src/data.js` 원문 그대로이며
`tools/line-check.mjs` 가 그 문자열이 실제로 있는지 확인해 지어낸 문장을 막는다.
갈래 판정은 모델을 부르지 않고 낱말 규칙으로 하며, 틀리면 화면에서 본인이 고칠 수 있다.

**오늘 나온 줄은 아카이브에 섞이지 않는다.** 테이블(`bloom_line`)도 `dist/index.html` 도 별개다.

## 참여 기능 (Supabase)

발언 공감과 기록 제보는 Supabase 의 `bloom_marks` / `bloom_notes` 에 쌓인다.
테이블은 RLS 를 켜고 정책을 두지 않아 anon 이 직접 만질 수 없고, `SECURITY DEFINER` 함수
세 개만 열려 있다 — `bloom_mark_counts`, `bloom_mark`, `bloom_note`.

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... node build.mjs
```

익명 키는 공개돼도 되는 값이다(그래서 이름이 anon 이다). 두 값이 없으면 참여 UI 가 꺼진 상태로
빌드된다. 제보는 자동 노출되지 않으므로 주기적으로 확인해야 한다:

```sql
select created_at, kind, event_id, body, contact from public.bloom_notes
where status = 'new' order by created_at desc;
```

## 디스코드 봇 (자동 반영)

새 회차가 열리면 디스코드 원문을 읽어 **초안 PR 을 여는 것까지** 자동으로 한다.
자동으로 머지하지는 않는다 — 사람이 PR 을 보고 머지해야 페이지에 올라간다.

```
디스코드 채널
  ↓ bot/ingest.mjs    원문 그대로 bloom_raw 에 적재 (편집 금지, append-only)
  ↓ bot/extract.mjs   레코드 형식으로 분류·배치 (요약이 아니다)
  ↓ tools/verify-source.mjs   원문 대조 — 지어낸 문장이면 여기서 멈춘다
  ↓ bot/apply.mjs     src/data.js 에 추가 → node build.mjs
  ↓ 초안 PR
  ↓ 사람이 머지 → Vercel 자동 배포 → 디스코드에 반영 알림
```

**요약하지 않는다.** 요약은 해석이고, 이 페이지는 해석하지 않는다는 전제 위에 서 있다.
봇이 하는 일은 어느 문장이 인용이고 어느 문장이 진행 방식인지 골라 제자리에 넣는 것까지다.

**검사가 통과시키지 않으면 PR 도 열리지 않는다.** `tools/verify-source.mjs` 가 보는 것:

| 검사 | 걸리는 것 |
|---|---|
| 인용 대조 | `quotes[].t` 가 원문에 문자 그대로 없으면 실패. 다듬어도 실패한다 |
| 수치 대조 | 인원·산문 속 숫자가 원문에 없으면 실패. 추정치가 사실로 굳는 경로를 막는다 |
| 어휘 대조 | 원문에 없던 낱말 비율이 높으면 실패 — 옮긴 것이 아니라 쓴 것이다 |
| 평가 금지 | "시사한다", "인상적이다" 류의 진단 표현 |
| 실명 규칙 | 연사·운영진 명단에 없는 사람 이름 |
| 스키마 | 필드·요일·id 정합, 중복 회차 |

이 검사들이 실제로 막는지는 토큰 없이도 확인할 수 있다:

```bash
npm run bot:test    # 지어낸 인용·없는 수치·평가 문장·실명을 넣어 보고 잡히는지 본다
npm run verify      # 현재 src/data.js 가 규칙을 지키는지
```

### 필요한 것

디스코드 개발자 포털에서 봇을 만들고 **Message Content Intent** 를 켠 뒤, 대상 채널에
`View Channel` + `Read Message History` 권한으로 초대한다. 그리고 저장소 시크릿에:

| 시크릿 | 용도 |
|---|---|
| `DISCORD_BOT_TOKEN` | 봇 토큰 |
| `DISCORD_CHANNEL_IDS` | 읽을 채널 ID, 쉼표 구분 |
| `SUPABASE_SERVICE_KEY` | 원문 적재용. **페이지에 들어가는 익명 키와 다른 키다** |
| `ANTHROPIC_API_KEY` | 구조화 단계 |
| `AUTHOR_SALT` | 작성자 ID 해시 솔트 |
| `DISCORD_WEBHOOK_URL` | (선택) 반영 알림 |

`.github/workflows/discord-sync.yml` 이 매일 06:00 KST 에 돌고, Actions 탭에서 수동 실행도 된다.
로컬에서는 `.env.bot` 에 같은 값을 넣고 `npm run bot:dry` 로 대조까지만 돌려볼 수 있다.

작성자는 **해시만** 저장한다. 표시 이름을 남기지 않으므로 뒤 단계가 참석자 실명을 흘릴 경로가 없다.
`bot/out/` 에는 원문 사본이 떨어지므로 저장소에 올리지 않는다.

**운영진 동의가 먼저다.** 커뮤니티 채널 내용을 공개 페이지로 옮기는 일이라 기술 문제가 아니다.

## 점검

```bash
node tools/check.mjs   # 대비(WCAG AA) + 달력·드로어·필터 동작, 두 테마 모두
node tools/audit.mjs   # 390/768/1440px 가로 넘침
node tools/shoot.mjs   # 라이트·다크·모바일 스크린샷 → dist/shots/
node tools/participate.mjs  # 공감·제보 (RPC 응답을 흉내 내서 클라이언트 로직만)
node tools/bot-selftest.mjs # 봇 파이프라인 — 막아야 할 것을 막는지
```

대비 검사는 반투명 배경을 아래 레이어와 합성한 뒤 계산한다. 이 검사가 실제로 두 건을 잡아냈다 —
데이터 색을 글자에 쓴 곳들이라 상태 전용 토큰(`--ok` / `--warn`)으로 분리했다.

## 구성

| 경로 | 내용 |
|---|---|
| `src/data.js` | 아카이브 데이터. 사실은 전부 여기 있다 |
| `src/page.html` | 아카이브 마크업·스타일·동작. `/*__DATA__*/`, `/*__FONTS__*/` 자리 |
| `src/line.html` | 회고 모임용 `/line` (폰 + 발표자 화면) |
| `src/lineage.js` | 다섯 갈래와 그 갈래에 속한 기록 원문 |
| `build.mjs` | 데이터·폰트를 인라인해 `dist/index.html`, `dist/line.html` 생성 |
| `assets/fonts/` | 커밋된 폰트 병합본. 이게 있어야 CI 가 폰트를 잃지 않고 빌드한다 |
| `tools/subset_fonts.py` | 폰트 서브셋·병합 → base64 `@font-face` |
| `PRODUCT.md` / `DESIGN.md` | 제품 진실 / 빌드에서 기록한 디자인 시스템 |

## 기록 원칙

- 만든 사람은 참석자 한 명이다. Bloom 공식 자료가 아니고, 커뮤니티를 평가하거나 진단하는 문장은
  한 줄도 넣지 않았다.
- 모든 내용은 제공된 원본 아카이브(2026.08.06 수집)에서 왔다. 원문에 없는 사실은 넣지 않았다.
- 원문이 비워둔 값(참석 인원 미공개 회차 등)은 추정하지 않고 비워뒀다.
- 참석자 실명은 싣지 않는다. 조별 인사이트의 화자는 직군·소속으로 대체했다.
  연사·운영진은 이미 공개 홍보물에 이름이 실린 경우여서 그대로 뒀다.
- 따로 교차 검증한 항목과 검증하지 못한 항목은 페이지의 "기록 기준" 섹션에 그대로 적어뒀다.

디자인은 [pbakaus/impeccable](https://github.com/pbakaus/impeccable)의 크래프트 플로어를 따랐고,
차트는 `dataviz` 스킬의 절차대로 폼 → 색 역할 → 팔레트 검증 → 마크 규격 → 인터랙션 순으로 만들었다.
카테고리 팔레트는 `validate_palette.js`로 검증했다. 방향 계약은 `dist/index.html` 첫 주석에 있다.
