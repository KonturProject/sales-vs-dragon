/**
 * Tests of the real Code.gs against fake Google services (see gas-harness.mjs).
 * Run:  node --test apps-script/test/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBackend } from './gas-harness.mjs';

const PIN = '1234';

/** Rows of "Sales" that actually hold a sale (Date/Amount/ROP in their default columns A-C), ignoring the other columns. */
const saleRows = (b) => b.salesRows().slice(1).filter(r => [r[0], r[1], r[2]].some(v => String(v).trim() !== ''));

test('public GET: unchanged week status plus an empty command list and the server clock', () => {
    const b = loadBackend();
    const status = b.get();
    assert.equal(status.ok, true);
    assert.equal(status.plan, 5000000);
    assert.equal(status.totalThisWeek, 400000 + 250000 + 120000);
    assert.deepEqual(status.byRop.map(r => r.ropName).sort(), ['СР1', 'СР2']);
    assert.deepEqual(status.commands, []);
    assert.equal(status.serverNow, b.now());
});

test('the public GET never contains raw rows, the PIN or its hash', () => {
    const b = loadBackend();
    b.post({ action: 'changePin', pin: PIN, newPin: '987654' });
    const text = JSON.stringify(b.get());
    assert.ok(!text.includes('987654') && !text.includes('ADMIN_PIN') && !text.includes('$'));
    assert.ok(!('sales' in JSON.parse(text)));
});

test('legacy request { pin, plan } still sets the plan (older admin page)', () => {
    const b = loadBackend();
    assert.deepEqual(b.post({ pin: PIN, plan: 7000000 }), { ok: true, plan: 7000000 });
    assert.equal(b.get().plan, 7000000);
    assert.equal(b.settingsRows()[1][1], 7000000);
});

test('wrong PIN is refused and changes nothing', () => {
    const b = loadBackend();
    assert.deepEqual(b.post({ pin: '0000', plan: 1 }), { ok: false, error: 'invalid_pin' });
    assert.equal(b.settingsRows()[1][1], 5000000);
});

test('login checks the PIN; missing or absurd PINs fail', () => {
    const b = loadBackend();
    assert.deepEqual(b.post({ action: 'login', pin: PIN }), { ok: true });
    assert.equal(b.post({ action: 'login' }).error, 'invalid_pin');
    assert.equal(b.post({ action: 'login', pin: 'x'.repeat(500) }).error, 'invalid_pin');
});

test('five wrong PINs lock the API; even the right PIN waits; it unlocks after the lock time', () => {
    const b = loadBackend();
    for (let i = 0; i < 4; i++) assert.equal(b.post({ action: 'login', pin: 'bad' + i }).error, 'invalid_pin');
    const fifth = b.post({ action: 'login', pin: 'bad5' });
    assert.equal(fifth.error, 'locked');
    assert.ok(fifth.retryAfterSec > 0 && fifth.retryAfterSec <= 600);

    const rightButLocked = b.post({ action: 'login', pin: PIN });
    assert.equal(rightButLocked.error, 'locked');

    b.advance(601 * 1000);
    assert.deepEqual(b.post({ action: 'login', pin: PIN }), { ok: true });
});

test('a right PIN clears the failure count', () => {
    const b = loadBackend();
    for (let i = 0; i < 4; i++) b.post({ action: 'login', pin: 'bad' });
    assert.equal(b.post({ action: 'login', pin: PIN }).ok, true);
    for (let i = 0; i < 4; i++) assert.equal(b.post({ action: 'login', pin: 'bad' }).error, 'invalid_pin');
});

test('unknown action and malformed body are bad requests', () => {
    const b = loadBackend();
    assert.equal(b.post({ action: 'dropTable', pin: PIN }).error, 'bad_request');
    assert.equal(b.post({ action: 'toString', pin: PIN }).error, 'bad_request', 'inherited object members are not actions');
    assert.equal(b.post({ action: 'constructor', pin: PIN }).error, 'bad_request');
    assert.equal(b.postRaw('not json').error, 'bad_request');
    assert.equal(b.postRaw('null').error, 'bad_request');
    assert.equal(b.postRaw('42').error, 'bad_request');
});

test('a fault on the server side is reported as server_error, not blamed on the request', () => {
    const b = loadBackend();
    b.renameSheet('Sales', 'Sales-broken');
    const res = b.post({ action: 'listSales', pin: PIN });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'server_error');
    assert.match(res.detail, /Sales/);
    assert.equal(b.post({ action: 'login', pin: PIN }).ok, true, 'and the PIN check itself still works');
});

test('listSales: newest first, limited, with week status and the plan', () => {
    const b = loadBackend();
    const res = b.post({ action: 'listSales', pin: PIN, limit: 2 });
    assert.equal(res.ok, true);
    assert.equal(res.totalRows, 3, 'the three empty rows that only hold the drop-down list in column F are not sales');
    assert.equal(res.shown, 2);
    assert.deepEqual(res.sales.map(s => [s.rop, s.amount, s.row]), [['СР1', 120000, 4], ['СР2', 250000, 3]]);
    assert.match(res.sales[0].date, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.equal(res.settings.WeeklyPlan, 5000000);
    assert.equal(res.status.totalThisWeek, 770000);
    assert.equal(b.post({ action: 'listSales', pin: 'no' }).error, 'invalid_pin');
});

test('addSale fills the first free sales row and leaves the other columns alone (no gap, no appended row)', () => {
    const b = loadBackend();
    const rowsBefore = b.salesRows().length;
    const res = b.post({ action: 'addSale', pin: PIN, rop: 'СР5', amount: 150000 });
    assert.equal(res.ok, true);
    assert.equal(res.added.rop, 'СР5');
    assert.equal(res.added.row, 5, 'right after the last real sale, not below the drop-down list in column F');
    assert.equal(res.status.totalThisWeek, 770000 + 150000);

    const rows = b.salesRows();
    assert.equal(rows.length, rowsBefore, 'no row was appended at the bottom');
    const added = rows[4]; // sheet row 5
    assert.equal(added[1], 150000);
    assert.equal(added[2], 'СР5');
    assert.equal(typeof added[0].getTime, 'function');
    assert.equal(added[3], '', 'names column untouched');
    assert.equal(added[5], 'СР5', 'the drop-down list value in column F is still there');
    assert.deepEqual(rows[5].slice(3), ['', '', 'СР6'], 'the next row is untouched');
});

test('two additions in a row go into consecutive rows', () => {
    const b = loadBackend();
    assert.equal(b.post({ action: 'addSale', pin: PIN, rop: 'СР1', amount: 1000 }).added.row, 5);
    assert.equal(b.post({ action: 'addSale', pin: PIN, rop: 'СР2', amount: 2000 }).added.row, 6);
    assert.equal(b.post({ action: 'listSales', pin: PIN }).sales.map(s => s.row).join(), '6,5,4,3,2');
});

test('addSale follows the header order, not fixed positions', () => {
    const b = loadBackend();
    // swap the Date and ROP columns everywhere: header becomes ROP | Amount | Date
    b.salesRows().forEach(r => { [r[0], r[2]] = [r[2], r[0]]; });
    assert.equal(b.post({ action: 'addSale', pin: PIN, rop: 'СР9', amount: 5000 }).ok, true);
    const added = b.salesRows()[4];
    assert.equal(added[0], 'СР9');
    assert.equal(added[1], 5000);
    assert.equal(typeof added[2].getTime, 'function');
    assert.equal(added[5], 'СР5', 'column F untouched');
});

test('addSale accepts a past date (date only, or with time) and rejects impossible ones', () => {
    const b = loadBackend();
    assert.equal(b.post({ action: 'addSale', pin: PIN, rop: 'СР2', amount: 1000, date: '2026-09-21' }).added.date, '2026-09-21', 'a date without a time is stored as midnight and shown without one');
    assert.equal(b.post({ action: 'addSale', pin: PIN, rop: 'СР2', amount: 1000, date: '2026-09-22T09:30' }).added.date, '2026-09-22 09:30');
    const listed = b.post({ action: 'listSales', pin: PIN, limit: 2 }).sales.map(s => s.date);
    assert.deepEqual(listed, ['2026-09-22 09:30', '2026-09-21']);
    for (const date of ['22.09.2026', '2026-13-40', '2019-01-01', '2030-01-01', 'yesterday']) {
        assert.equal(b.post({ action: 'addSale', pin: PIN, rop: 'СР2', amount: 1000, date }).error, 'bad_request', date);
    }
});

test('addSale rejects bad departments and amounts, including spreadsheet-formula injection', () => {
    const b = loadBackend();
    const rows = JSON.stringify(b.salesRows());
    const bad = [
        { rop: '=IMPORTXML("http://x")', amount: 1 },
        { rop: '+cmd', amount: 1 },
        { rop: '@SUM(A1)', amount: 1 },
        { rop: '', amount: 1 },
        { rop: 'x'.repeat(40), amount: 1 },
        { rop: 'СР1', amount: -5 },
        { rop: 'СР1', amount: 0 },
        { rop: 'СР1', amount: 'abc' },
        { rop: 'СР1', amount: '' },
        { rop: 'СР1', amount: 1e12 },
    ];
    for (const payload of bad) assert.equal(b.post({ action: 'addSale', pin: PIN, ...payload }).error, 'bad_request', JSON.stringify(payload));
    assert.equal(JSON.stringify(b.salesRows()), rows, 'the sheet is unchanged');
});

test('a retried addSale (same requestId) adds one row only', () => {
    const b = loadBackend();
    const rows = saleRows(b).length;
    const first = b.post({ action: 'addSale', pin: PIN, rop: 'СР3', amount: 70000, requestId: 'abc-1' });
    const again = b.post({ action: 'addSale', pin: PIN, rop: 'СР3', amount: 70000, requestId: 'abc-1' });
    assert.deepEqual(again, first);
    assert.equal(saleRows(b).length, rows + 1);
    b.post({ action: 'addSale', pin: PIN, rop: 'СР3', amount: 70000, requestId: 'abc-2' });
    assert.equal(saleRows(b).length, rows + 2);
});

test('changePin: needs the old PIN, a 4-12 digit new one; then only the new one works and the old plain PIN is gone', () => {
    const b = loadBackend();
    assert.equal(b.post({ action: 'changePin', pin: 'nope', newPin: '5555' }).error, 'invalid_pin');
    for (const newPin of ['12', '1234567890123', 'abcd', '12 34', '', undefined]) {
        assert.equal(b.post({ action: 'changePin', pin: PIN, newPin }).error, 'bad_request', String(newPin));
    }
    assert.equal(b.post({ action: 'changePin', pin: PIN, newPin: PIN }).error, 'bad_request');
    assert.equal(b.props.get('ADMIN_PIN'), PIN, 'nothing changed by the rejected attempts');

    assert.deepEqual(b.post({ action: 'changePin', pin: PIN, newPin: '482913' }), { ok: true });
    assert.equal(b.post({ action: 'login', pin: PIN }).error, 'invalid_pin');
    assert.equal(b.post({ action: 'login', pin: '482913' }).ok, true);
    assert.equal(b.props.has('ADMIN_PIN'), false, 'legacy plain PIN removed');
    const stored = b.props.get('ADMIN_PIN_HASH');
    assert.match(stored, /^[0-9a-f-]{36}\$[0-9a-f]{64}$/);
    assert.ok(![...b.props.values()].some(v => v.includes('482913')), 'the new PIN is not stored in clear text');
});

test('setAdminPin_ (editor recovery path) stores a hash too', () => {
    const b = loadBackend({ legacyPin: null });
    assert.equal(b.post({ action: 'login', pin: '0000' }).error, 'invalid_pin', 'no PIN set yet');
    b.run('setAdminPin_');
    assert.equal(b.post({ action: 'login', pin: '0000' }).ok, true);
});

test('commands: validated, queued with rising ids, visible on the public GET, never touch the sheets', () => {
    const b = loadBackend();
    const salesBefore = JSON.stringify(b.salesRows());
    const settingsBefore = JSON.stringify(b.settingsRows());

    assert.deepEqual(b.post({ action: 'command', pin: PIN, type: 'growl' }), { ok: true, id: 1 });
    assert.deepEqual(b.post({ action: 'command', pin: PIN, type: 'hit', args: { rop: 'СР5', amount: 90000 } }), { ok: true, id: 2 });
    assert.equal(b.post({ action: 'command', pin: PIN, type: 'fall', args: { hero: 'hero_yoda', mode: 'doze' } }).id, 3);
    b.post({ action: 'command', pin: PIN, type: 'fall' });
    b.post({ action: 'command', pin: PIN, type: 'wake' });
    b.post({ action: 'command', pin: PIN, type: 'confetti' });
    b.post({ action: 'command', pin: PIN, type: 'celebrate' });

    const commands = b.get().commands;
    assert.deepEqual(commands.map(c => c.type), ['growl', 'hit', 'fall', 'fall', 'wake', 'confetti', 'celebrate']);
    assert.deepEqual(commands.map(c => c.id), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(commands[1].args, { rop: 'СР5', amount: 90000 });
    assert.deepEqual(commands[3].args, { hero: 'random', mode: 'random' });

    assert.equal(JSON.stringify(b.salesRows()), salesBefore);
    assert.equal(JSON.stringify(b.settingsRows()), settingsBefore);
});

test('commands: a hit gets a default amount; bad types/args and a wrong PIN are refused', () => {
    const b = loadBackend();
    b.post({ action: 'command', pin: PIN, type: 'hit', args: { rop: 'СР1' } });
    assert.equal(b.get().commands[0].args.amount, 50000);
    for (const [type, args] of [['explode', {}], ['hit', {}], ['hit', { rop: 'СР1', amount: -1 }], ['hit', { rop: '=1+1' }], ['fall', { hero: 'hero_x' }], ['fall', { mode: 'die' }]]) {
        assert.equal(b.post({ action: 'command', pin: PIN, type, args }).error, 'bad_request', type + JSON.stringify(args));
    }
    assert.equal(b.post({ action: 'command', pin: 'bad', type: 'growl' }).error, 'invalid_pin');
    assert.equal(b.get().commands.length, 1);
});

test('commands: only the last 10 are kept, and old ones drop off the public list', () => {
    const b = loadBackend();
    for (let i = 0; i < 13; i++) b.post({ action: 'command', pin: PIN, type: 'growl' });
    let ids = b.get().commands.map(c => c.id);
    assert.deepEqual(ids, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

    b.advance(11 * 60 * 1000);
    assert.deepEqual(b.get().commands, []);
    assert.equal(b.post({ action: 'command', pin: PIN, type: 'wake' }).id, 14, 'ids keep rising');
    ids = b.get().commands.map(c => c.id);
    assert.deepEqual(ids, [14]);
});

test('a retried command (same requestId) is queued once', () => {
    const b = loadBackend();
    b.post({ action: 'command', pin: PIN, type: 'growl', requestId: 'r1' });
    b.post({ action: 'command', pin: PIN, type: 'growl', requestId: 'r1' });
    assert.equal(b.get().commands.length, 1);
});

/* ----------------------------------------------------- average check, payment import */

const day = (d) => d.toISOString ? d.toISOString().slice(0, 10) : String(d);

test('setAvgCheck stores the month\'s average check, the public status carries it, bad values are refused, 0 switches it off', () => {
    const b = loadBackend();
    assert.equal(b.get().avgCheck, 0, 'not set yet');
    assert.deepEqual(b.post({ action: 'setAvgCheck', pin: PIN, avgCheck: 40197.7 }), { ok: true, avgCheck: 40197.7 });
    assert.equal(b.get().avgCheck, 40197.7);
    assert.equal(b.post({ action: 'listSales', pin: PIN }).settings.AvgCheck, 40197.7);
    assert.equal(b.post({ action: 'setAvgCheck', pin: PIN, avgCheck: -1 }).error, 'bad_request');
    assert.equal(b.post({ action: 'setAvgCheck', pin: PIN, avgCheck: 'abc' }).field, 'avgCheck');
    assert.equal(b.post({ action: 'setAvgCheck', pin: 'no', avgCheck: 5 }).error, 'invalid_pin');
    assert.equal(b.post({ action: 'setAvgCheck', pin: PIN, avgCheck: 0 }).ok, true);
    assert.equal(b.get().avgCheck, 0);
});

test('countSales reports how many sales a period holds now (whole days, both ends included)', () => {
    const b = loadBackend(); // sales on 2026-09-21 (400 000), 2026-09-22 (250 000), 2026-09-23 (120 000)
    assert.deepEqual(b.post({ action: 'countSales', pin: PIN, from: '2026-09-22', to: '2026-09-23' }), { ok: true, count: 2, total: 370000 });
    assert.deepEqual(b.post({ action: 'countSales', pin: PIN, from: '2026-09-24', to: '2026-09-30' }), { ok: true, count: 0, total: 0 });
    assert.equal(b.post({ action: 'countSales', pin: PIN, from: '2026-09-23', to: '2026-09-22' }).field, 'period');
    assert.equal(b.post({ action: 'countSales', pin: PIN, from: 'x', to: '2026-09-22' }).field, 'period');
});

test('replaceSales swaps every sale of the period for the uploaded ones and leaves the other days alone', () => {
    const b = loadBackend();
    const res = b.post({
        action: 'replaceSales', pin: PIN, from: '2026-09-22', to: '2026-09-23',
        rows: [
            { date: '2026-09-23', amount: 30000, rop: 'СР3' },
            { date: '2026-09-22', amount: 20000, rop: 'СР5' },
            { date: '2026-09-22', amount: 10000, rop: 'СР5' },
        ],
    });
    assert.equal(res.ok, true);
    assert.equal(res.removed, 2);
    assert.equal(res.added, 3);
    const rows = saleRows(b);
    assert.equal(rows.length, 4, '1 untouched + 3 uploaded');
    assert.deepEqual(rows.filter(r => r[2] === 'СР1' && r[1] === 400000).length, 1, 'the day before the period is untouched');
    assert.deepEqual(rows.map(r => r[1]).sort((x, y) => x - y), [10000, 20000, 30000, 400000]);
    assert.equal(res.status.totalThisWeek, 400000 + 60000);
    assert.equal(b.post({ action: 'countSales', pin: PIN, from: '2026-09-22', to: '2026-09-23' }).count, 3);
});

test('replaceSales reuses the freed rows first, appends after the last sale and leaves the other columns alone', () => {
    const b = loadBackend();
    b.post({
        action: 'replaceSales', pin: PIN, from: '2026-09-22', to: '2026-09-23',
        rows: [1, 2, 3, 4].map(i => ({ date: '2026-09-23', amount: i * 1000, rop: 'СР2' })),
    });
    const all = b.salesRows();
    assert.equal(all.length, 7, 'no row was appended at the bottom of the sheet');
    assert.equal(all[1][3], 'Андреева Татьяна', 'names column untouched');
    assert.equal(all[4][5], 'СР5', 'drop-down list untouched');
    assert.equal(saleRows(b).length, 1 + 4);
    assert.equal(typeof all[4][0].getTime, 'function', 'a real date, at midnight');
});

test('replaceSales with fewer uploaded rows than there were clears the leftovers (never deletes a row)', () => {
    const b = loadBackend();
    const before = b.salesRows().length;
    b.post({ action: 'replaceSales', pin: PIN, from: '2026-09-22', to: '2026-09-23', rows: [{ date: '2026-09-22', amount: 5000, rop: 'СР6' }] });
    assert.equal(b.salesRows().length, before);
    assert.equal(saleRows(b).length, 2);
});

test('replaceSales with no rows empties the period', () => {
    const b = loadBackend();
    const res = b.post({ action: 'replaceSales', pin: PIN, from: '2026-09-21', to: '2026-09-23', rows: [] });
    assert.equal(res.ok, true);
    assert.equal(res.removed, 3);
    assert.equal(saleRows(b).length, 0);
});

test('replaceSales refuses a bad period, a row outside it, a bad department or amount, and changes nothing', () => {
    const b = loadBackend();
    const good = { date: '2026-09-22', amount: 1000, rop: 'СР1' };
    const call = (extra) => b.post({ action: 'replaceSales', pin: PIN, from: '2026-09-22', to: '2026-09-23', rows: [good], ...extra });
    assert.equal(call({ from: '2026-09-24' }).field, 'period');
    assert.equal(call({ to: 'tomorrow' }).field, 'period');
    assert.equal(call({ rows: 'many' }).field, 'rows');
    assert.equal(call({ rows: [{ ...good, date: '2026-09-25' }] }).field, 'rows', 'outside the period');
    assert.equal(call({ rows: [{ ...good, rop: '<b>' }] }).field, 'rows');
    assert.equal(call({ rows: [{ ...good, amount: -5 }] }).field, 'rows');
    assert.equal(call({ rows: [{ ...good, amount: 'abc' }] }).field, 'rows');
    assert.equal(call({ rows: Array.from({ length: 3001 }, () => good) }).field, 'rows', 'too many');
    assert.equal(b.post({ action: 'replaceSales', pin: 'no', from: '2026-09-22', to: '2026-09-23', rows: [good] }).error, 'invalid_pin');
    assert.equal(saleRows(b).length, 3, 'nothing was changed by any refused call');
});

test('replaceSales repeated with the same requestId does not run twice', () => {
    const b = loadBackend();
    const body = { action: 'replaceSales', pin: PIN, from: '2026-09-22', to: '2026-09-23', rows: [{ date: '2026-09-22', amount: 777, rop: 'СР9' }], requestId: 'abc' };
    assert.equal(b.post(body).added, 1);
    assert.equal(b.post(body).added, 1);
    assert.equal(saleRows(b).filter(r => r[1] === 777).length, 1);
});

/* ------------------------------------------------------------------ deleteSale */

test('deleteSale clears the three cells of that row (never the row itself) and leaves the other columns alone', () => {
    const b = loadBackend(); // row 3 = 250 000, СР2, the day before the clock
    const rowsBefore = b.salesRows().length;
    const listed = b.post({ action: 'listSales', pin: PIN }).sales.find(s => s.row === 3);
    const res = b.post({ action: 'deleteSale', pin: PIN, row: 3, date: listed.date, amount: 250000, rop: 'СР2' });
    assert.equal(res.ok, true);
    assert.equal(res.deleted.row, 3);
    assert.equal(res.status.totalThisWeek, 400000 + 120000);
    assert.equal(b.salesRows().length, rowsBefore, 'no row removed: that would shift the drop-down list');
    const row = b.salesRows()[2];
    assert.deepEqual([row[0], row[1], row[2]], ['', '', '']);
    assert.equal(row[3], 'Татиевская Нина', 'names column untouched');
    assert.equal(row[5], 'СР2', 'drop-down list untouched');
    assert.equal(saleRows(b).length, 2);
    assert.equal(b.post({ action: 'addSale', pin: PIN, rop: 'СР9', amount: 1000 }).added.row, 5, 'the freed middle row does not move the append position');
});

test('deleteSale refuses when the row is not what the admin saw, and changes nothing', () => {
    const b = loadBackend();
    const date = b.post({ action: 'listSales', pin: PIN }).sales.find(s => s.row === 3).date;
    const call = (extra) => b.post({ action: 'deleteSale', pin: PIN, row: 3, date, amount: 250000, rop: 'СР2', ...extra });
    assert.equal(call({ amount: 250001 }).error, 'row_changed');
    assert.equal(call({ rop: 'СР1' }).error, 'row_changed');
    assert.equal(call({ date: '2026-01-01' }).error, 'row_changed');
    assert.equal(call({ row: 6 }).error, 'row_changed', 'a row with no sale in it');
    assert.equal(call({ row: 99 }).error, 'row_changed', 'a row past the end');
    assert.equal(call({ row: 1 }).field, 'row', 'the header');
    assert.equal(call({ row: 'x' }).field, 'row');
    assert.equal(b.post({ action: 'deleteSale', pin: 'no', row: 3, date, amount: 250000, rop: 'СР2' }).error, 'invalid_pin');
    assert.equal(saleRows(b).length, 3);
});

test('deleteSale repeated with the same requestId answers the same and deletes once', () => {
    const b = loadBackend();
    const date = b.post({ action: 'listSales', pin: PIN }).sales.find(s => s.row === 3).date;
    const body = { action: 'deleteSale', pin: PIN, row: 3, date, amount: 250000, rop: 'СР2', requestId: 'del1' };
    assert.equal(b.post(body).ok, true);
    assert.equal(b.post(body).ok, true, 'the retry gets the first answer, not row_changed');
    assert.equal(saleRows(b).length, 2);
});

/* ------------------------------------------------- lastSale and importedAt in the public status */

test('the public status carries the newest payment (latest date, the lower row on a tie) as department, amount and date only', () => {
    const b = loadBackend(); // rows: 09-21 СР1 400k (row 2), 09-22 СР2 250k (row 3), 09-23 09:00 СР1 120k (row 4)
    const last = b.get().lastSale;
    assert.deepEqual(Object.keys(last).sort(), ['amount', 'date', 'rop']);
    assert.equal(last.rop, 'СР1');
    assert.equal(last.amount, 120000);
    assert.match(last.date, /^2026-09-23/);

    // a payment of an older day added last (a bigger row number) is not "the last"
    b.post({ action: 'addSale', pin: PIN, rop: 'СР9', amount: 5000, date: '2026-09-20' });
    assert.equal(b.get().lastSale.rop, 'СР1');
    // the same day, lower in the sheet, wins the tie
    b.post({ action: 'addSale', pin: PIN, rop: 'СР6', amount: 7000, date: '2026-09-23T09:00' });
    assert.equal(b.get().lastSale.rop, 'СР6');
});

test('lastSale looks at the whole table, not only this week, and is null for an empty one', () => {
    const b = loadBackend();
    b.post({ action: 'replaceSales', pin: PIN, from: '2026-09-21', to: '2026-09-23', rows: [{ date: '2026-08-03', amount: 1000, rop: 'СР5' }].map(r => ({ ...r, date: '2026-09-21' })) });
    // move the clock a month on: the payment is no longer in the current week, but it is still the last record
    b.advance(30 * 86400000);
    assert.equal(b.get().totalThisWeek, 0);
    assert.equal(b.get().lastSale.rop, 'СР5');
    b.post({ action: 'replaceSales', pin: PIN, from: '2026-09-21', to: '2026-09-23', rows: [] });
    assert.equal(b.get().lastSale, null);
});

test('importedAt changes only with an import (replaceSales), not with addSale or deleteSale', () => {
    const b = loadBackend();
    assert.equal(b.get().importedAt, 0);
    b.post({ action: 'addSale', pin: PIN, rop: 'СР2', amount: 1000 });
    assert.equal(b.get().importedAt, 0);
    b.advance(5000);
    b.post({ action: 'replaceSales', pin: PIN, from: '2026-09-22', to: '2026-09-23', rows: [{ date: '2026-09-22', amount: 1, rop: 'СР1' }] });
    const first = b.get().importedAt;
    assert.equal(first, b.now(), 'the backend clock at the import');
    b.advance(5000);
    const date = b.post({ action: 'listSales', pin: PIN }).sales[0];
    b.post({ action: 'deleteSale', pin: PIN, row: date.row, date: date.date, amount: date.amount, rop: date.rop });
    assert.equal(b.get().importedAt, first);
    b.post({ action: 'replaceSales', pin: PIN, from: '2026-09-22', to: '2026-09-23', rows: [] });
    assert.ok(b.get().importedAt > first);
});

test('a refused import does not move importedAt', () => {
    const b = loadBackend();
    b.post({ action: 'replaceSales', pin: PIN, from: '2026-09-24', to: '2026-09-23', rows: [] });
    assert.equal(b.get().importedAt, 0);
});
