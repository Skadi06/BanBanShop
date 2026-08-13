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
    const value = Math.abs(Number(purchase.price) || 0);
    const codes = {
        admin_add_coin: ["admin_add_coin", value],
        admin_minus_coin: ["admin_minus_coin", -value],
        admin_add_owed: ["admin_add_owed", -value],
        admin_minus_owed: ["admin_minus_owed", value],
        user_pay_owed: ["user_pay_owed", value]
    };
    const [type, amount] = codes[itemName] || ["purchase", -value];
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

function emptyState() { return { viewer: null, shopper: { username: null, coins: 0, coins_owed: 0, last_login: null }, balance: 0, owed: 0, history: [] }; }
async function getState() { return getAccessToken() ? normalizeState(await apiFetch("/api/history")) : emptyState(); }
async function setBalance(balance) { return normalizeState(await apiFetch("/api/coins", { mode: "set", balance })); }
async function addCoins(amount) { return normalizeState(await apiFetch("/api/coins", { mode: "increment", amount })); }
async function adjustOwed(amount) { return normalizeState(await apiFetch("/api/coins", { mode: "increment_owed", amount })); }
async function purchase({ itemName, price, quantity }) { return normalizeState(await apiFetch("/api/buy", { product: itemName, price, quantity })); }
async function payOwed(amount) { return normalizeState(await apiFetch("/api/pay-owed", { amount })); }
async function signIn(username, password) { const payload = await apiFetch("/api/auth-login", { username, password }); setAccessToken(payload.access_token); return login(); }
async function signOut() { setAccessToken(null); }
async function login() { return normalizeState(await apiFetch("/api/login")); }
async function getSessionUser() { return getAccessToken() ? { loggedIn: true } : null; }

window.BanbanAuth = { signIn, signOut, login, getSessionUser };
window.BanbanStore = { getState, setBalance, addCoins, adjustOwed, purchase, payOwed };
