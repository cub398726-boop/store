/**
 * 고수의집밥 맛집탐방 — Google Apps Script 백엔드 (B1: 페이지 + 데이터 한 번에)
 *
 * 배포 방법은 같은 폴더의 README.md 참고.
 * - doGet()          : 화면(Index.html)을 공개 GitHub raw URL에서 불러와 서빙
 * - getAll()         : places + reviews 전체 반환
 * - addPlace(obj)    : 가게 추가 (주소 → 좌표 자동 변환)
 * - addReview(obj)   : 평가 추가
 * - deleteReview(id) : 평가 1건 삭제
 * - deletePlace(id)  : 가게 + 그 가게의 평가 전부 삭제
 * - geocodeMissing() : 좌표 없는 기존 가게들의 좌표를 일괄로 채움 (편집기에서 직접 실행)
 *
 * 데이터는 이 스크립트가 붙어 있는 스프레드시트의
 * 'places' / 'reviews' 탭에 저장됩니다. 탭과 헤더(열)는 자동 생성/추가됩니다.
 *
 * ── 좌표 변환(지오코딩)에는 카카오 REST 키가 필요합니다 ──
 * 1) https://developers.kakao.com → 내 애플리케이션 → 애플리케이션 추가하기
 * 2) 생성된 앱의 "REST API 키" 복사
 * 3) Apps Script 편집기: 왼쪽 ⚙ 프로젝트 설정 → "스크립트 속성" → 속성 추가
 *      속성 이름:  KAKAO_REST_KEY
 *      값:        (복사한 REST API 키)
 * 4) 저장. (도메인/플랫폼 등록은 필요 없음 — 서버에서 호출)
 * 키가 없어도 앱은 동작하며, 좌표만 비어서 지도에 안 찍힙니다.
 */

var PLACES = 'places';
var REVIEWS = 'reviews';
var PLACE_COLS = ['id', 'name', 'category', 'address', 'lat', 'lng', 'createdAt'];
var REVIEW_COLS = ['id', 'placeId', 'taste', 'price', 'mood', 'service', 'hygiene', 'comment', 'createdAt'];
var DIM_KEYS = ['taste', 'price', 'mood', 'service', 'hygiene'];

var UI_URL = 'https://raw.githubusercontent.com/cub398726-boop/store/main/Index.html';

function doGet() {
  var html;
  try {
    var res = UrlFetchApp.fetch(UI_URL, { muteHttpExceptions: true });
    html = (res.getResponseCode() === 200)
      ? res.getContentText()
      : '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px">'
        + '화면 파일을 불러오지 못했어요 (HTTP ' + res.getResponseCode() + '). 잠시 후 새로고침 해주세요.';
  } catch (e) {
    html = '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px">'
      + '화면 파일을 불러오지 못했어요: ' + e + '</body>';
  }
  return HtmlService.createHtmlOutput(html)
    .setTitle('고수의집밥 맛집탐방')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- sheet helpers ---------- */

function sheet_(name, cols) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var lastCol = sh.getLastColumn();
  var header = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (header.length === 0) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
  } else {
    var missing = cols.filter(function (c) { return header.indexOf(c) === -1; });
    if (missing.length) {
      sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
    }
  }
  return sh;
}

function headerOf_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

function appendObj_(sh, obj) {
  var header = headerOf_(sh);
  var row = header.map(function (h) { return obj.hasOwnProperty(h) ? obj[h] : ''; });
  sh.appendRow(row);
}

function readRows_(name, cols) {
  var sh = sheet_(name, cols);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row[0] === '' || row[0] == null) continue;
    var o = {};
    for (var c = 0; c < header.length; c++) o[header[c]] = row[c];
    out.push(o);
  }
  return out;
}

/* ---------- geocoding (Kakao Local API) ---------- */

function geocode_(address, fallbackName) {
  var key = PropertiesService.getScriptProperties().getProperty('KAKAO_REST_KEY');
  if (!key) return null;

  var hit = function (url) {
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'KakaoAK ' + key },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return null;
    var docs = (JSON.parse(res.getContentText()).documents) || [];
    if (!docs.length) return null;
    var d = docs[0];
    var x = d.x || (d.road_address && d.road_address.x) || (d.address && d.address.x);
    var y = d.y || (d.road_address && d.road_address.y) || (d.address && d.address.y);
    if (!x || !y) return null;
    return { lat: Number(y), lng: Number(x) };
  };

  var base = 'https://dapi.kakao.com/v2/local/search/';
  var addr = String(address || '').trim();
  var nm = String(fallbackName || '').trim();
  try {
    return hit(base + 'address.json?analyze_type=similar&query=' + encodeURIComponent(addr))
        || (nm && hit(base + 'keyword.json?query=' + encodeURIComponent(nm + ' ' + addr)))
        || hit(base + 'keyword.json?query=' + encodeURIComponent(addr))
        || (nm && hit(base + 'keyword.json?query=' + encodeURIComponent(nm)))
        || null;
  } catch (e) {
    return null;
  }
}

/* ---------- read ---------- */

function getAll() {
  return {
    places: readRows_(PLACES, PLACE_COLS),
    reviews: readRows_(REVIEWS, REVIEW_COLS),
    now: Date.now()
  };
}

/* ---------- write ---------- */

function addPlace(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var name = String((p && p.name) || '').trim().slice(0, 60);
    var address = String((p && p.address) || '').trim().slice(0, 120);
    var category = String((p && p.category) || '기타').trim().slice(0, 20) || '기타';
    if (!name) throw new Error('업체명이 필요합니다');
    if (!address) throw new Error('주소가 필요합니다');
    var sh = sheet_(PLACES, PLACE_COLS);
    var g = null;
    try { g = geocode_(address, name); } catch (e) { g = null; }
    appendObj_(sh, {
      id: Utilities.getUuid(),
      name: name, category: category, address: address,
      lat: g ? g.lat : '', lng: g ? g.lng : '',
      createdAt: Date.now()
    });
    return { ok: true, geocoded: !!g };
  } finally {
    lock.releaseLock();
  }
}

function addReview(v) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var placeId = String((v && v.placeId) || '');
    if (!placeId) throw new Error('placeId가 필요합니다');
    var score = function (x) {
      x = Math.round(Number(x));
      return (x >= 1 && x <= 5) ? x : 0;
    };
    var obj = { id: Utilities.getUuid(), placeId: placeId };
    for (var i = 0; i < DIM_KEYS.length; i++) {
      var s = score(v && v[DIM_KEYS[i]]);
      if (!s) throw new Error('모든 항목에 별점이 필요합니다');
      obj[DIM_KEYS[i]] = s;
    }
    obj.comment = String((v && v.comment) || '').trim().slice(0, 200);
    obj.createdAt = Date.now();
    appendObj_(sheet_(REVIEWS, REVIEW_COLS), obj);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function deleteReview(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    deleteRowsById_(REVIEWS, REVIEW_COLS, 'id', id);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function deletePlace(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    deleteRowsById_(REVIEWS, REVIEW_COLS, 'placeId', id);
    deleteRowsById_(PLACES, PLACE_COLS, 'id', id);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* colName 열의 값이 id와 같은 행을 모두 삭제 (아래에서 위로) */
function deleteRowsById_(name, cols, colName, id) {
  var sh = sheet_(name, cols);
  var last = sh.getLastRow();
  if (last < 2) return;
  var header = headerOf_(sh);
  var ci = header.indexOf(colName);
  if (ci === -1) return;
  var colVals = sh.getRange(1, ci + 1, last, 1).getValues();
  for (var r = colVals.length - 1; r >= 1; r--) {
    if (String(colVals[r][0]) === String(id)) sh.deleteRow(r + 1);
  }
}

/* ---------- 좌표 일괄 채우기 (편집기에서 직접 실행) ---------- */

function geocodeMissing() {
  if (!PropertiesService.getScriptProperties().getProperty('KAKAO_REST_KEY')) {
    throw new Error('먼저 스크립트 속성에 KAKAO_REST_KEY 를 등록하세요 (파일 상단 주석 참고).');
  }
  var sh = sheet_(PLACES, PLACE_COLS);
  var last = sh.getLastRow();
  if (last < 2) return '가게가 없습니다.';
  var header = headerOf_(sh);
  var iLat = header.indexOf('lat'), iLng = header.indexOf('lng');
  var iAddr = header.indexOf('address'), iName = header.indexOf('name');
  var rng = sh.getRange(2, 1, last - 1, header.length);
  var vals = rng.getValues();
  var done = 0, fail = 0, skip = 0;
  for (var r = 0; r < vals.length; r++) {
    var has = vals[r][iLat] !== '' && vals[r][iLat] != null && Number(vals[r][iLat]);
    if (has) { skip++; continue; }
    var g = geocode_(String(vals[r][iAddr] || ''), String(vals[r][iName] || ''));
    if (g) { vals[r][iLat] = g.lat; vals[r][iLng] = g.lng; done++; }
    else { fail++; }
    Utilities.sleep(200);
  }
  rng.setValues(vals);
  var msg = '좌표 채움 ' + done + '건 · 실패 ' + fail + '건 · 이미있음 ' + skip + '건';
  Logger.log(msg);
  return msg;
}
