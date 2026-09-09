# 고수의집밥 맛집탐방 — 배포 / 운영 메모

- **화면(`Index.html`)** : 공개 GitHub 저장소 `cub398726-boop/store` 에서 서빙.
  → 화면 수정은 `git push` 만. Apps Script 재배포 필요 없음.
- **백엔드(`Code.gs`)** : 구글 Apps Script 웹앱. 시트 읽기/쓰기 + 화면 파일 중계 + 지오코딩.
  → `Code.gs` 를 수정했을 때만 재배포.
- 공용 암호 없음 — `/exec` 링크 아는 사람은 누구나 접속·평가.

## 파일

| 파일 | 어디에 |
|---|---|
| `Code.gs` | Apps Script 프로젝트의 `Code.gs` 에 붙여넣기 |
| `Index.html` | GitHub `store` 저장소 루트. (Apps Script 프로젝트에는 더 이상 안 넣음) |

## 화면 수정 흐름 (재배포 없음)

```
git add -A && git commit -m "수정" && git push
```
→ `/exec` 페이지에서 Ctrl+Shift+R (최대 몇 분, GitHub 캐시)

## Code.gs 수정 흐름 (재배포 1회)

1. `Code.gs` 전체를 Apps Script 편집기에 붙여넣기 → 저장
2. **배포 → 배포 관리 → ✏️ → 버전: "새 버전" → 배포** (`/exec` URL 유지)

---

## 지도 기능 — 카카오 REST 키 등록 (1회)

주소 → 좌표 변환에 카카오 로컬 API를 씁니다.

1. https://developers.kakao.com → **내 애플리케이션 → 애플리케이션 추가하기**
2. 만든 앱의 **REST API 키** 복사
3. Apps Script 편집기: 왼쪽 **⚙ 프로젝트 설정 → 스크립트 속성 → 속성 추가**
   - 이름: `KAKAO_REST_KEY`
   - 값: (복사한 REST API 키)
4. 저장. (플랫폼/도메인 등록 불필요 — 서버에서 호출)

키가 없어도 앱은 정상 동작하고, 좌표만 안 채워져서 지도에 안 찍힙니다.

### 기존 가게 좌표 채우기

키 등록 후, Apps Script 편집기 상단 함수 선택 → **`geocodeMissing`** → **실행**.
좌표 없는 가게들의 주소를 한 번에 변환해 시트 `lat`/`lng` 열에 채웁니다.
(새로 등록하는 가게는 등록 시 자동으로 좌표가 들어갑니다.)

---

## 다른 사람 평점 — 구글 플레이스 API (선택)

가게를 추가할 때 구글의 **별점 · 리뷰 수 · 리뷰 3개**를 같이 저장해 참고용으로 보여줍니다.

1. https://console.cloud.google.com → 프로젝트 생성(또는 기존 선택)
2. **API 및 서비스 → 라이브러리** → **Places API** 검색 → **사용 설정**
   (※ "Places API (New)" 말고 그냥 **Places API**)
3. **결제** → 결제 계정 연결(카드 필요). 월 $200 무료 크레딧이 자동 적용돼 소규모 사용은 실비 0에 가깝습니다.
4. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키** → 키 복사
   - (권장) 키 수정 → **API 제한**에서 "Places API"만 허용
5. Apps Script: **⚙ 프로젝트 설정 → 스크립트 속성 → 속성 추가**
   - 이름: `GOOGLE_PLACES_KEY`
   - 값: 복사한 API 키
6. `Code.gs` 붙여넣기 → 재배포(새 버전)

### 기존 가게에 구글 평점 채우기

편집기 함수 선택 → **`backfillGoogle`** → 실행
→ 시트 `places` 탭 `gRating`/`gCount`/`gUrl`/`gReviews` 열이 채워집니다.
(새로 등록하는 가게는 자동으로 들어갑니다. 키가 없으면 그냥 비어서 표시만 안 됩니다.)

진단: 함수 선택 → **`diag`** 실행 → 로그에 `GOOGLE_PLACES_KEY` / `googlePlace rating=...` 확인.

---

## 데이터 구조 (시트에서 바로 보임)

**`places` 탭**

| id | name | category | address | lat | lng | createdAt |
|---|---|---|---|---|---|---|

**`reviews` 탭**

| id | placeId | taste | price | mood | service | hygiene | comment | createdAt |
|---|---|---|---|---|---|---|---|---|

- `placeId` 가 `places.id` 와 연결됨.
- `taste`=맛, `price`=가성비, `mood`=분위기, `service`=서비스, `hygiene`=위생 (각 1~5).
- 종합점수 = 다섯 항목 평균. 시트에서 행을 직접 고치거나 지우면 화면에도 반영됨(최대 6초).
- `lat`/`lng` 를 손으로 수정해 핀 위치를 바로잡아도 됨.

## 참고 / 한계

- **실시간 아님**: 남이 넣은 평가·가게는 최대 6초 뒤(자동 새로고침) 반영.
- **익명**: 누가 평가했는지는 저장하지 않음. 한 사람이 같은 가게를 여러 번 평가 가능(모두 평균).
- 지도 바탕은 OpenStreetMap. 시트/스크립트/카카오앱 **소유자 = 만든 사람**.
- 무료 구글 계정 + 카카오 무료 쿼터(하루 10만 건)로 소규모 사용엔 충분.
