/**
 * 점심 장부 — Google Apps Script 백엔드 (B1: 페이지 + 데이터 한 번에)
 *
 * 배포 방법은 같은 폴더의 README.md 참고.
 * - doGet()         : Index.html 페이지를 서빙
 * - getAll()        : places + reviews 전체 반환
 * - addPlace(obj)   : 가게 추가
 * - addReview(obj)  : 평가 추가
 * - deleteReview(id): 평가 1건 삭제
 * - deletePlace(id) : 가게 + 그 가게의 평가 전부 삭제
 *
 * 데이터는 이 스크립트가 붙어 있는 스프레드시트의
 * 'places' / 'reviews' 탭에 저장됩니다. 탭과 헤더는 자동 생성됩니다.
 */

var PLACES = 'places';
var REVIEWS = 'reviews';
var PLACE_COLS = ['id', 'name', 'category', 'address', 'createdAt'];
var REVIEW_COLS = ['id', 'placeId', 'taste', 'price', 'mood', 'service', 'hygiene', 'comment', 'createdAt'];
var DIM_KEYS = ['taste', 'price', 'mood', 'service', 'hygiene'];

/**
 * 화면(Index.html)은 Apps Script 프로젝트가 아니라 아래 공개 GitHub raw URL에서 불러옵니다.
 * → Index.html 을 고칠 때는 `git push` 만 하면 되고, 이 스크립트는 재배포할 필요가 없습니다.
 *   (이 Code.gs 파일 자체를 고쳤을 때만 "배포 관리 → 새 버전"으로 재배포하세요.)
 * → 변경이 화면에 반영되기까지 최대 몇 분 걸릴 수 있습니다(GitHub 캐시). 강력 새로고침(Ctrl+Shift+R)하면 더 빠릅니다.
 */
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
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
  }
  return sh;
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
    var id = Utilities.getUuid();
    sh.appendRow([id, name, category, address, Date.now()]);
    return { ok: true, id: id };
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
    var vals = DIM_KEYS.map(function (k) { return score(v && v[k]); });
    for (var i = 0; i < vals.length; i++) {
      if (!vals[i]) throw new Error('모든 항목에 별점이 필요합니다');
    }
    var comment = String((v && v.comment) || '').trim().slice(0, 200);
    var sh = sheet_(REVIEWS, REVIEW_COLS);
    var id = Utilities.getUuid();
    sh.appendRow([id, placeId, vals[0], vals[1], vals[2], vals[3], vals[4], comment, Date.now()]);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function deleteReview(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    deleteRowsById_(REVIEWS, REVIEW_COLS, 0, id);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function deletePlace(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    deleteRowsById_(REVIEWS, REVIEW_COLS, 1, id); // placeId 열 기준으로 그 가게 평가 전부
    deleteRowsById_(PLACES, PLACE_COLS, 0, id);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* colIndex 열의 값이 id와 같은 행을 모두 삭제 (아래에서 위로) */
function deleteRowsById_(name, cols, colIndex, id) {
  var sh = sheet_(name, cols);
  var last = sh.getLastRow();
  if (last < 2) return;
  var colVals = sh.getRange(1, colIndex + 1, last, 1).getValues();
  for (var r = colVals.length - 1; r >= 1; r--) {
    if (String(colVals[r][0]) === String(id)) sh.deleteRow(r + 1);
  }
}
