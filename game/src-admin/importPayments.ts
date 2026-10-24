/**
 * Reads the payment report the accounts system exports (.xlsx) into rows the backend can store.
 * Pure functions on the sheet's cell values (rows of cells) — no DOM, no network — so they are easy to check on a real file.
 *
 * What it looks for (by header text, not by position): «Дата оплаты», «Группа», «Сумма». The department comes out of the
 * group name («КЦПК_НП_СР_Тверь_СР3_ГБ» → СР3). Rows that are not a payment (the report's «Сумма заказа» total, blank
 * lines) and payments of a group with no known department are left out and reported, never guessed. Bonus invoices (the
 * Академия's 30-rouble ones, see BONUS_INVOICE) are left out too: they are not sales.
 */

export interface PaymentRow { date: string; amount: number; rop: string }
export interface SkippedGroup { group: string; count: number; sum: number }
export interface ParsedPayments {
    rows: PaymentRow[];
    /** Bonus invoices that were left out (not sales). */
    bonus: { count: number; sum: number };
    /** Payments whose group names no known department. */
    skipped: SkippedGroup[];
    /** First and last payment date among `rows` ('yyyy-MM-dd'), or null when there are none. */
    from: string | null;
    to: string | null;
}

const HEADERS = { date: 'Дата оплаты', group: 'Группа', amount: 'Сумма', product: 'Тип головного продукта' } as const;

/** A payment of exactly this amount for this kind of product is a bonus invoice, not a sale. */
export const BONUS_INVOICE = { product: 'Академия', amount: 30 } as const;

const norm = (cell: unknown) => String(cell ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** 'СР3' out of a group name; accepts the Latin look-alikes C/P in case the export was retyped. */
export function ropOfGroup(group: string, known: ReadonlySet<string>): string | null {
    const match = /(?:^|[^A-Za-zА-Яа-яЁё])[СC][РP]\s?(\d{1,2})(?![0-9])/i.exec(group);
    if (!match) return null;
    const rop = `СР${match[1]}`;
    return known.has(rop) ? rop : null;
}

/** 'yyyy-MM-dd' of a date cell. Excel dates arrive as UTC midnight of the calendar day, so the UTC fields are the day. */
function dayOf(cell: unknown): string | null {
    if (cell instanceof Date && !isNaN(cell.getTime())) {
        const p = (n: number, w = 2) => String(n).padStart(w, '0');
        return `${p(cell.getUTCFullYear(), 4)}-${p(cell.getUTCMonth() + 1)}-${p(cell.getUTCDate())}`;
    }
    // A date the reader did not recognise as one (a custom number format) arrives as Excel's day serial: days since 1899-12-30.
    if (typeof cell === 'number' && cell > 20000 && cell < 80000) return dayOf(new Date(Math.round((cell - 25569) * 86400000)));
    if (typeof cell === 'string' && /^\d{4}-\d{2}-\d{2}/.test(cell.trim())) return cell.trim().slice(0, 10);
    const dotted = typeof cell === 'string' ? /^(\d{2})\.(\d{2})\.(\d{4})/.exec(cell.trim()) : null;
    return dotted ? `${dotted[3]}-${dotted[2]}-${dotted[1]}` : null;
}

export function parsePayments(sheet: unknown[][], knownRops: ReadonlySet<string>): ParsedPayments {
    const headerAt = sheet.findIndex(row => {
        const cells = row.map(norm);
        return cells.includes(norm(HEADERS.date)) && cells.includes(norm(HEADERS.group)) && cells.includes(norm(HEADERS.amount));
    });
    if (headerAt < 0) throw new Error('header_not_found');
    const header = sheet[headerAt].map(norm);
    const col = {
        date: header.indexOf(norm(HEADERS.date)),
        group: header.indexOf(norm(HEADERS.group)),
        amount: header.indexOf(norm(HEADERS.amount)),
        product: header.indexOf(norm(HEADERS.product)), // optional: without it nothing is taken for a bonus invoice
    };

    const rows: PaymentRow[] = [];
    const bonus = { count: 0, sum: 0 };
    const skipped = new Map<string, SkippedGroup>();
    for (const line of sheet.slice(headerAt + 1)) {
        const date = dayOf(line[col.date]);
        const amount = typeof line[col.amount] === 'number' ? (line[col.amount] as number) : NaN;
        if (!date || !isFinite(amount) || amount <= 0) continue; // the report's total line, blanks
        if (col.product >= 0 && amount === BONUS_INVOICE.amount && norm(line[col.product]) === norm(BONUS_INVOICE.product)) {
            bonus.count++;
            bonus.sum += amount;
            continue;
        }
        const group = String(line[col.group] ?? '').trim();
        const rop = ropOfGroup(group, knownRops);
        if (!rop) {
            const entry = skipped.get(group) ?? { group, count: 0, sum: 0 };
            entry.count++;
            entry.sum += amount;
            skipped.set(group, entry);
            continue;
        }
        rows.push({ date, amount, rop });
    }

    const days = rows.map(r => r.date).sort();
    return { rows, bonus, skipped: [...skipped.values()], from: days[0] ?? null, to: days[days.length - 1] ?? null };
}
