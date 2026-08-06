# Bloom 아카이브

Bloom 커뮤니티가 2026년 4월 14일부터 8월 6일까지 빌린 방들의 기록을 한 페이지로 압축한 것.
25회 이상의 행사, 연사 발언, 조별 정리, 운영진이 스스로 올린 공개 회고를 담았다.

결과물은 자체 완결형 단일 파일 `dist/index.html` — 외부 요청이 하나도 없다. 폰트까지 인라인돼 있어
파일 하나만 열면 그대로 동작한다.

## 만들기

```bash
node build.mjs                          # 시스템 폰트 스택으로 빌드
FONTS_DIR=/path/to/fonts node build.mjs # 웹폰트를 서브셋해 인라인
```

`FONTS_DIR`는 [fontsource](https://fontsource.org) woff2 트리를 가리킨다:

```
FONTS_DIR/overpass/overpass-latin-<weight>-normal.woff2
FONTS_DIR/gothic/gothic-a1-<n>-<weight>-normal.woff2
```

```bash
npm pack @fontsource/overpass @fontsource/gothic-a1   # 원본 받기
pip install fonttools brotli                          # 서브셋에 필요
```

빌드는 최종 마크업에 남는 글자만 골라 폰트를 자르고, fontsource가 100조각으로 쪼개 배포하는
Gothic A1을 하나로 병합한다 (조각별 오버헤드가 사라져 175KB → 55KB).

## 점검

```bash
node tools/check.mjs   # 대비(WCAG AA) + 검색·필터·태그 동작
node tools/audit.mjs   # 390/768/1440px 가로 넘침
node tools/shoot.mjs   # 다크·라이트·모바일 스크린샷 → dist/shots/
```

`tools/check.mjs`의 대비 검사는 반투명 배경을 아래 레이어와 합성한 뒤 계산한다.

## 구성

| 경로 | 내용 |
|---|---|
| `src/data.js` | 아카이브 데이터. 사실은 전부 여기 있다 |
| `src/page.html` | 마크업·스타일·동작. `/*__DATA__*/`, `/*__FONTS__*/` 자리 |
| `build.mjs` | 데이터·폰트를 인라인해 `dist/index.html` 생성 |
| `tools/subset_fonts.py` | 폰트 서브셋·병합 → base64 `@font-face` |
| `PRODUCT.md` / `DESIGN.md` | 제품 진실 / 빌드에서 기록한 디자인 시스템 |

## 기록 원칙

- 모든 내용은 제공된 원본 아카이브(2026.08.06 수집)에서 왔다. 원문에 없는 사실은 넣지 않았다.
- 원문이 비워둔 값(참석 인원 미공개 회차 등)은 추정하지 않고 비워뒀다.
- 참석자 실명은 싣지 않는다. 조별 인사이트의 화자는 직군·소속으로 대체했다.
  연사·운영진은 이미 공개 홍보물에 이름이 실린 경우여서 그대로 뒀다.
- 따로 교차 검증한 항목과 검증하지 못한 항목은 페이지의 "기록 기준" 섹션에 그대로 적어뒀다.

디자인 방향은 [pbakaus/impeccable](https://github.com/pbakaus/impeccable)의 크래프트 플로어와
방향 결정 절차를 따랐다. 시드 키는 `dist/index.html` 첫 주석에 남아 있다.
