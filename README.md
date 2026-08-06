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

## 점검

```bash
node tools/check.mjs   # 대비(WCAG AA) + 달력·드로어·필터 동작, 두 테마 모두
node tools/audit.mjs   # 390/768/1440px 가로 넘침
node tools/shoot.mjs   # 라이트·다크·모바일 스크린샷 → dist/shots/
```

대비 검사는 반투명 배경을 아래 레이어와 합성한 뒤 계산한다. 이 검사가 실제로 두 건을 잡아냈다 —
데이터 색을 글자에 쓴 곳들이라 상태 전용 토큰(`--ok` / `--warn`)으로 분리했다.

## 구성

| 경로 | 내용 |
|---|---|
| `src/data.js` | 아카이브 데이터. 사실은 전부 여기 있다 |
| `src/page.html` | 마크업·스타일·동작. `/*__DATA__*/`, `/*__FONTS__*/` 자리 |
| `build.mjs` | 데이터·폰트를 인라인해 `dist/index.html` 생성 |
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
