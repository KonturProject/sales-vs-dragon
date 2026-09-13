interface RuntimeConfig {
    appsScriptUrl: string;
    useMock?: boolean;
}

interface SetPlanResponse {
    ok: boolean;
    plan?: number;
    error?: string;
}

interface StatusResponse {
    ok: boolean;
    plan: number;
    totalThisWeek: number;
}

const pinForm = document.getElementById('pin-form') as HTMLFormElement;
const planForm = document.getElementById('plan-form') as HTMLFormElement;
const pinInput = document.getElementById('pin') as HTMLInputElement;
const planInput = document.getElementById('plan') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;
const currentStatusEl = document.getElementById('current-status') as HTMLParagraphElement;

let currentPin = '';
let config: RuntimeConfig | null = null;

function setStatus(text: string, kind: 'ok' | 'error' | '' = '') {
    statusEl.textContent = text;
    statusEl.className = kind;
}

async function loadConfig(): Promise<RuntimeConfig> {
    const res = await fetch('config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`config.json fetch failed: ${res.status}`);
    return res.json();
}

// Public unauthenticated read — no PIN needed. Lets the person editing the
// plan see the real current numbers instead of typing a new plan blind.
async function loadCurrentStatus() {
    try {
        const cfg = await loadConfig();
        config = cfg;
        const url = (cfg.useMock || !cfg.appsScriptUrl) ? 'assets/mock/mock-status.json' : cfg.appsScriptUrl;
        const res = await fetch(url, { cache: 'no-store' });
        const status: StatusResponse = await res.json();
        if (!status.ok) return;

        planInput.value = String(status.plan);
        currentStatusEl.textContent =
            `Сейчас: ${Math.round(status.totalThisWeek).toLocaleString('ru-RU')} / ${Math.round(status.plan).toLocaleString('ru-RU')} ₽`;
        currentStatusEl.hidden = false;
    } catch (e) {
        console.warn('[loadCurrentStatus] failed, falling back to blank plan input:', e);
    }
}

loadCurrentStatus();

// The PIN itself is never checked in the browser — only the Apps Script backend
// (via PropertiesService) validates it. This form just captures it and reveals
// the plan-entry step; a wrong PIN is only discovered on actual submit below.
pinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    currentPin = pinInput.value;
    pinForm.hidden = true;
    planForm.hidden = false;
    setStatus('');
});

planForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('Сохраняю...');

    if (!config) {
        try {
            config = await loadConfig();
        } catch (err) {
            setStatus('Не удалось загрузить конфигурацию приложения.', 'error');
            return;
        }
    }

    if (config.useMock || !config.appsScriptUrl) {
        setStatus('Демо-режим (config.json.useMock=true): запись в таблицу отключена.', 'error');
        return;
    }

    try {
        const res = await fetch(config.appsScriptUrl, {
            method: 'POST',
            // Deliberately text/plain, not application/json — Apps Script Web Apps
            // don't handle CORS preflight, and application/json would trigger one.
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ pin: currentPin, plan: Number(planInput.value) }),
        });
        const data: SetPlanResponse = await res.json();

        if (data.ok) {
            setStatus(`План обновлён: ${data.plan?.toLocaleString('ru-RU')} ₽`, 'ok');
        } else if (data.error === 'invalid_pin') {
            setStatus('Неверный PIN. Введите его снова.', 'error');
            planForm.hidden = true;
            pinForm.hidden = false;
            pinInput.value = '';
        } else {
            setStatus(`Ошибка: ${data.error ?? 'неизвестная'}`, 'error');
        }
    } catch (err) {
        setStatus('Не удалось связаться с сервером. Проверьте соединение.', 'error');
    }
});
