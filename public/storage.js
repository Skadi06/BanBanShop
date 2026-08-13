const SESSION_KEY = "banban_session_token";

function getAccessToken() { return localStorage.getItem(SESSION_KEY); }
function setAccessToken(token) { if (token) localStorage.setItem(SESSION_KEY, token); else localStorage.removeItem(SESSION_KEY); }

async function apiFetch(path, body) {
    const token = getAccessToken();
    const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body || {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed");
    return payload;
}

function mapPurchaseToHistoryRow(purchase) {
    const itemName = String(purchase.product || "");
    const rawAmount = Number(purchase.price) || 0;
    let type = "purchase";
    let amount = -Math.abs(rawAmount);

    if (itemName === "用户偿还欠款" || itemName === "Banban Coin owed payment" || itemName.includes("\u8fd8\u6b3e")) {
        type = "owed_payment";
    } else if (itemName === "管理员增加欠款" || itemName === "管理员减少欠款" || itemName.includes("\u6b20\u6b3e")) {
        type = "owed_adjustment";
        amount = itemName.includes("减少") ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    } else if (itemName === "管理员增加 Banban币" || itemName === "管理员减少 Banban币") {
        type = "admin_adjustment";
        amount = itemName.includes("减少") ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    }

    if (type === "owed_payment") amount = Math.abs(rawAmount);
    if (type === "owed_adjustment") {
        amount = itemName.includes("\u51cf\u5c11") ? Math.abs(rawAmount) : -Math.abs(rawAmount);
    }

    return { ts: purchase.created_at, type, amount, itemId: itemName, itemName };
}

function normalizeState(payload) {
    return {
        viewer: payload.viewer || null,
        shopper: payload.shopper || { username: null, coins: 0, coins_owed: 0, last_login: null },
        balance: Number(payload.shopper?.coins || 0),
        owed: Number(payload.shopper?.coins_owed || 0),
        history: Array.isArray(payload.history) ? payload.history.map(mapPurchaseToHistoryRow) : []
    };
}

function emptyState() {
    return { viewer: null, shopper: { username: null, coins: 0, coins_owed: 0, last_login: null }, balance: 0, owed: 0, history: [] };
}

async function getState() {
    if (!getAccessToken()) return emptyState();
    return normalizeState(await apiFetch("/api/history"));
}

async function setBalance(balance) {
    if (!Number.isInteger(balance) || balance < 0) throw new Error("balance_must_be_non_negative_integer");
    return normalizeState(await apiFetch("/api/coins", { mode: "set", balance }));
}

async function addCoins(amount) {
    if (!Number.isInteger(amount) || amount === 0) throw new Error("amount_must_be_non_zero_integer");
    return normalizeState(await apiFetch("/api/coins", { mode: "increment", amount }));
}

async function adjustOwed(amount) {
    if (!Number.isInteger(amount) || amount === 0) throw new Error("owed_amount_must_be_non_zero_integer");
    return normalizeState(await apiFetch("/api/coins", { mode: "increment_owed", amount }));
}

async function purchase({ itemName, price, quantity }) {
    if (!itemName || !Number.isInteger(price) || price <= 0 || !Number.isInteger(quantity) || quantity <= 0) throw new Error("invalid_purchase");
    return normalizeState(await apiFetch("/api/buy", { product: itemName, price, quantity }));
}

async function payOwed(amount) { return normalizeState(await apiFetch("/api/pay-owed", { amount })); }
async function signIn(username, password) { const payload = await apiFetch("/api/auth-login", { username, password }); setAccessToken(payload.access_token); return login(); }
async function signOut() { setAccessToken(null); }
async function login() { return normalizeState(await apiFetch("/api/login")); }
async function getSessionUser() { return getAccessToken() ? { loggedIn: true } : null; }

window.BanbanAuth = { signIn, signOut, login, getSessionUser };
window.BanbanStore = { getState, setBalance, addCoins, adjustOwed, purchase, payOwed };
