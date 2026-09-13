/**
 * Backend for the "Свин и загон" sales mini-game.
 * Standalone script (not container-bound) — opens the spreadsheet explicitly by
 * ID via getSpreadsheet_(), so it works from script.google.com directly without
 * going through Extensions > Apps Script inside the sheet itself.
 *
 * Sheet schema (tab names are literal, columns are header-matched, order-independent):
 *   "Sales"    — Date | Amount | ROP           (one row per incoming payment)
 *   "Settings" — Key | Value                   (rows: WeeklyPlan, TotalMeters)
 *
 * The PIN lives ONLY in PropertiesService, never in this source file and never
 * echoed back in any response — see setAdminPin_() below, run once manually.
 */

var SPREADSHEET_ID = '1TQHdp3ylSog5pfmhIy1WEB0cG_YdSYB19V7FvnPlIWs';
var SALES_SHEET_NAME = 'Sales';
var SETTINGS_SHEET_NAME = 'Settings';
var PIN_PROPERTY_KEY = 'ADMIN_PIN';

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Run this ONCE from the Apps Script editor (select it in the function dropdown,
 * click Run) to seed the admin PIN, then delete/comment out the literal below so
 * it doesn't sit in source control. Re-run any time to change the PIN.
 */
function setAdminPin_() {
  var pin = '0000'; // CHANGE THIS, run once, then remove the literal.
  PropertiesService.getScriptProperties().setProperty(PIN_PROPERTY_KEY, pin);
}

function doGet(e) {
  try {
    var status = computeWeeklyStatus_();
    return jsonResponse_(status);
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'server_error', detail: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var pin = body.pin;
    var plan = Number(body.plan);

    if (!verifyPin_(pin)) {
      return jsonResponse_({ ok: false, error: 'invalid_pin' });
    }
    if (!isFinite(plan) || plan < 0) {
      return jsonResponse_({ ok: false, error: 'bad_request' });
    }

    setSetting_('WeeklyPlan', plan);
    return jsonResponse_({ ok: true, plan: plan });
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'bad_request', detail: String(err) });
  }
}

/** Manual test helper — run from the editor, inspect via View > Logs. */
function testDoGet() {
  var result = doGet({ parameter: {} });
  Logger.log(result.getContent());
}

function computeWeeklyStatus_() {
  var ss = getSpreadsheet_();
  var tz = ss.getSpreadsheetTimeZone();
  var bounds = getWeekBounds_(new Date(), tz);

  var salesSheet = ss.getSheetByName(SALES_SHEET_NAME);
  if (!salesSheet) throw new Error('Missing "' + SALES_SHEET_NAME + '" sheet');

  var values = salesSheet.getDataRange().getValues();
  var header = values[0];
  var dateCol = header.indexOf('Date');
  var amountCol = header.indexOf('Amount');
  var ropCol = header.indexOf('ROP');
  if (dateCol < 0 || amountCol < 0 || ropCol < 0) {
    throw new Error('Sales sheet must have Date, Amount, ROP columns');
  }

  var totalsByRop = {};
  var totalThisWeek = 0;

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var rawDate = row[dateCol];
    if (!rawDate) continue;
    var date = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (date < bounds.start || date >= bounds.end) continue;

    var amount = Number(row[amountCol]) || 0;
    var rop = String(row[ropCol] || '').trim();
    if (!rop) continue;

    totalsByRop[rop] = (totalsByRop[rop] || 0) + amount;
    totalThisWeek += amount;
  }

  var plan = Number(getSetting_('WeeklyPlan')) || 0;
  var totalMeters = Number(getSetting_('TotalMeters')) || 300;
  var ratio = plan > 0 ? Math.min(1, Math.max(0, totalThisWeek / plan)) : 0;
  var metersRemaining = Math.round(totalMeters * (1 - ratio));

  var byRop = [];
  for (var ropName in totalsByRop) {
    byRop.push({ ropName: ropName, amount: totalsByRop[ropName] });
  }

  return {
    ok: true,
    weekStart: Utilities.formatDate(bounds.start, tz, 'yyyy-MM-dd'),
    weekEnd: Utilities.formatDate(bounds.end, tz, 'yyyy-MM-dd'),
    plan: plan,
    totalThisWeek: totalThisWeek,
    totalMeters: totalMeters,
    metersRemaining: metersRemaining,
    byRop: byRop,
    lastUpdated: new Date().toISOString()
  };
}

/** Monday 00:00 (inclusive) to next Monday 00:00 (exclusive), in the sheet's own timezone. */
function getWeekBounds_(now, tz) {
  var dayOfWeek = Number(Utilities.formatDate(now, tz, 'u')); // 1=Mon..7=Sun
  var startOfToday = new Date(Utilities.formatDate(now, tz, "yyyy-MM-dd'T'00:00:00"));
  var start = new Date(startOfToday.getTime() - (dayOfWeek - 1) * 86400000);
  var end = new Date(start.getTime() + 7 * 86400000);
  return { start: start, end: end };
}

function verifyPin_(pin) {
  var stored = PropertiesService.getScriptProperties().getProperty(PIN_PROPERTY_KEY);
  return stored !== null && String(pin) === stored;
}

function getSettingsSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) throw new Error('Missing "' + SETTINGS_SHEET_NAME + '" sheet');
  return sheet;
}

function getSetting_(key) {
  var sheet = getSettingsSheet_();
  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === key) return values[i][1];
  }
  return null;
}

function setSetting_(key, value) {
  var sheet = getSettingsSheet_();
  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
