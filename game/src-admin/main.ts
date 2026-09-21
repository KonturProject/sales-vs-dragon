import ropMapping from '../src/game/config/ropMapping.json';
import { BackendError, callBackend, fetchPublicStatus, newRequestId } from './api';

/** Human names of the heroes, for the buttons (department codes alone are not friendly). */
const HERO_NAMES: Record<string, string> = {
    hero_lion: 'Лев',
    hero_scrooge: 'Скрудж',
    hero_grinch: 'Гринч',
    hero_yoda: 'Йода',
    hero_neznaika: 'Незнайка',
    hero_minion: 'Миньон',
};

const DEPARTMENTS = Object.entries(ropMapping.mapping as Record<string, string>).map(([rop, slug]) => ({
    rop,
    slug,
    label: `${rop} · ${HERO_NAMES[slug] ?? slug}`,
}));

interface Sale { row: number; date: string; amount: number; rop: string }
interface Status { plan: number; totalThisWeek: number; weekStart: string; weekEnd: string; byRop: { ropName: string; amount: number }[] }
interface ListSalesResponse { totalRows: number; shown: number; sales: Sale[]; status: Status }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const pinForm = $<HTMLFormElement>('pin-form');
const pinInput = $<HTMLInputElement>('pin');
const panel = $<HTMLDivElement>('panel');
const statusEl = $<HTMLParagraphElement>('status');

/** Kept in memory only for this page's lifetime — never stored, never in a URL. */
let pin = '';
let tableStale = true;

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

function setStatus(text: string, kind: 'ok' | 'error' | '' = '') {
    statusEl.textContent = text;
    statusEl.className = kind;
}

function showLogin(message = '') {
    pin = '';
    pinInput.value = '';
    panel.hidden = true;
    pinForm.hidden = false;
    setStatus(message, message ? 'error' : '');
}

const FIELD_NAMES: Record<string, string> = {
    plan: 'план', rop: 'отдел', amount: 'сумма', date: 'дата', newPin: 'новый PIN', newPin_same: 'новый PIN совпадает со старым',
    type: 'тип команды', args: 'параметры команды',
};

/** One place that turns a failed backend call into a message (and sends the user back to the PIN form when the PIN is the problem). */
function reportError(err: unknown) {
    if (!(err instanceof BackendError)) {
        console.error(err);
        setStatus('Что-то пошло не так. Подробности в консоли браузера.', 'error');
        return;
    }
    switch (err.code) {
        case 'invalid_pin':
            showLogin('Неверный PIN. Введите его снова.');
            break;
        case 'locked': {
            const minutes = Math.max(1, Math.ceil((err.detail?.retryAfterSec ?? 600) / 60));
            showLogin(`Слишком много неверных попыток. Подождите примерно ${minutes} мин.`);
            break;
        }
        case 'network':
            setStatus('Не удалось связаться с сервером. Проверьте соединение.', 'error');
            break;
        case 'demo':
            setStatus('Демо-режим (config.json.useMock=true): бэкенд отключён.', 'error');
            break;
        case 'bad_request':
            setStatus(`Проверьте поле: ${FIELD_NAMES[err.detail?.field ?? ''] ?? err.detail?.field ?? 'данные'}.`, 'error');
            break;
        default:
            setStatus(`Ошибка: ${err.code}`, 'error');
    }
}

/* ----------------------------------------------------------------- login */

pinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('Проверяю…');
    const typed = pinInput.value;
    try {
        await callBackend('login', typed);
    } catch (err) {
        reportError(err);
        return;
    }
    pin = typed;
    pinInput.value = '';
    pinForm.hidden = true;
    panel.hidden = false;
    setStatus('');
    tableStale = true;
    loadPlanTab();
});

$('logout').addEventListener('click', () => showLogin());

/* ------------------------------------------------------------------ tabs */

const tabButtons = [...document.querySelectorAll<HTMLButtonElement>('.tab-btn')];
const tabPanels = [...document.querySelectorAll<HTMLElement>('[data-tab-panel]')];

function openTab(name: string) {
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    tabPanels.forEach(p => { p.hidden = p.dataset.tabPanel !== name; });
    setStatus('');
    if (name === 'plan') loadPlanTab();
    if (name === 'table' && tableStale) loadTable();
}

tabButtons.forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab!)));

/* ------------------------------------------------------------------ plan */

const planForm = $<HTMLFormElement>('plan-form');
const planInput = $<HTMLInputElement>('plan');
const currentStatusEl = $<HTMLParagraphElement>('current-status');

// Public read (no PIN): shows the real numbers so the plan is not edited blind.
async function loadPlanTab() {
    const status = await fetchPublicStatus();
    if (!status) return;
    planInput.value = String(status.plan);
    currentStatusEl.textContent = `Сейчас: ${money(status.totalThisWeek)} / ${money(status.plan)}`;
    currentStatusEl.hidden = false;
}

planForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('Сохраняю…');
    try {
        const res = await callBackend<{ plan: number }>('setPlan', pin, { plan: Number(planInput.value) });
        setStatus(`План обновлён: ${money(res.plan)}`, 'ok');
        tableStale = true;
        loadPlanTab();
    } catch (err) {
        reportError(err);
    }
});

/* ----------------------------------------------------------------- table */

const tableBody = document.querySelector<HTMLTableSectionElement>('#sales-table tbody')!;
const tableSummary = $<HTMLDivElement>('table-summary');
const tableMeta = $<HTMLSpanElement>('table-meta');

function chip(label: string, value: string) {
    const el = document.createElement('div');
    el.className = 'chip';
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('strong');
    v.textContent = value;
    el.append(l, v);
    return el;
}

async function loadTable() {
    setStatus('Читаю таблицу…');
    try {
        const res = await callBackend<ListSalesResponse>('listSales', pin, { limit: 50 });
        const s = res.status;
        const percent = s.plan > 0 ? Math.round((s.totalThisWeek / s.plan) * 100) : 0;

        tableSummary.replaceChildren(
            chip('Неделя', `${s.weekStart} — ${s.weekEnd}`),
            chip('План', money(s.plan)),
            chip('Набрано', `${money(s.totalThisWeek)} (${percent}%)`),
            ...s.byRop.map(r => chip(r.ropName, money(r.amount))),
        );

        tableBody.replaceChildren(...res.sales.map(sale => {
            const tr = document.createElement('tr');
            const cells = [String(sale.row), sale.date, sale.rop, Math.round(sale.amount).toLocaleString('ru-RU')];
            cells.forEach((text, i) => {
                const td = document.createElement('td');
                td.textContent = text; // textContent, never innerHTML: these are sheet cells
                if (i === 3) td.className = 'num';
                tr.append(td);
            });
            return tr;
        }));

        tableMeta.textContent = `Показано ${res.shown} из ${res.totalRows} строк (новые сверху)`;
        tableStale = false;
        setStatus('');
    } catch (err) {
        reportError(err);
    }
}

$('table-refresh').addEventListener('click', loadTable);

/* ------------------------------------------------------------- add sale */

const addForm = $<HTMLFormElement>('add-form');
const addRop = $<HTMLSelectElement>('add-rop');
const addAmount = $<HTMLInputElement>('add-amount');
const addDate = $<HTMLInputElement>('add-date');

for (const dep of DEPARTMENTS) addRop.add(new Option(dep.label, dep.rop));

addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number(addAmount.value);
    if (!(amount > 0)) {
        setStatus('Введите сумму больше нуля.', 'error');
        return;
    }
    const when = addDate.value ? addDate.value.replace('T', ' ') : 'сейчас';
    if (!confirm(`Внести в таблицу оплату ${money(amount)} для ${addRop.value} (${when})?\n\nЭто настоящая запись: итоги недели изменятся.`)) return;

    setStatus('Записываю…');
    const submit = addForm.querySelector('button')!;
    submit.disabled = true;
    try {
        const res = await callBackend<{ added: { date: string; amount: number; rop: string } }>('addSale', pin, {
            rop: addRop.value,
            amount,
            date: addDate.value || undefined,
            requestId: newRequestId(),
        });
        setStatus(`Записано: ${res.added.rop} — ${money(res.added.amount)} (${res.added.date})`, 'ok');
        addAmount.value = '';
        addDate.value = '';
        tableStale = true;
    } catch (err) {
        reportError(err);
    } finally {
        submit.disabled = false;
    }
});

/* ------------------------------------------------------------ animations */

const animAmount = $<HTMLInputElement>('anim-amount');
const animHero = $<HTMLSelectElement>('anim-hero');
const animHits = $<HTMLDivElement>('anim-hits');

animHero.add(new Option('Случайный', 'random'));
for (const dep of DEPARTMENTS) animHero.add(new Option(HERO_NAMES[dep.slug] ?? dep.slug, dep.slug));

for (const dep of DEPARTMENTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'anim-btn';
    button.textContent = dep.label;
    button.dataset.cmd = 'hit';
    button.dataset.rop = dep.rop;
    animHits.append(button);
}

function commandArgs(button: HTMLButtonElement): Record<string, unknown> {
    switch (button.dataset.cmd) {
        case 'hit': return { rop: button.dataset.rop, amount: Number(animAmount.value) || 50000 };
        case 'fall': return { hero: animHero.value, mode: button.dataset.mode };
        default: return {};
    }
}

async function sendCommand(button: HTMLButtonElement) {
    button.disabled = true;
    setStatus('Отправляю…');
    try {
        await callBackend('command', pin, {
            type: button.dataset.cmd,
            args: commandArgs(button),
            requestId: newRequestId(),
        });
        setStatus(`Отправлено: «${button.textContent}». Экраны покажут в течение ~15 секунд.`, 'ok');
    } catch (err) {
        reportError(err);
    } finally {
        // A short pause stops an accidental double click from queueing the animation twice.
        setTimeout(() => { button.disabled = false; }, 1200);
    }
}

document.querySelector('[data-tab-panel="anim"]')!.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-cmd]');
    if (button) sendCommand(button);
});

/* ----------------------------------------------------------- change PIN */

const pinChangeForm = $<HTMLFormElement>('pin-change-form');
const pinOld = $<HTMLInputElement>('pin-old');
const pinNew = $<HTMLInputElement>('pin-new');
const pinNew2 = $<HTMLInputElement>('pin-new2');

pinChangeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!/^[0-9]{4,12}$/.test(pinNew.value)) {
        setStatus('Новый PIN — от 4 до 12 цифр.', 'error');
        return;
    }
    if (pinNew.value !== pinNew2.value) {
        setStatus('Новый PIN и повтор не совпадают.', 'error');
        return;
    }
    setStatus('Меняю PIN…');
    try {
        await callBackend('changePin', pinOld.value, { newPin: pinNew.value });
        pin = pinNew.value;
        [pinOld, pinNew, pinNew2].forEach(input => { input.value = ''; });
        setStatus('PIN изменён. Прежний больше не действует.', 'ok');
    } catch (err) {
        // A mistyped *current* PIN here is a typo in this form, not a reason to throw the user back to the login screen.
        if (err instanceof BackendError && err.code === 'invalid_pin') setStatus('Текущий PIN указан неверно.', 'error');
        else reportError(err);
    }
});
