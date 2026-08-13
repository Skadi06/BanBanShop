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
    let historyCode = itemName;
    if (itemName === "Banban Coin owed payment" || itemName.startsWith("BanBan")) {
        historyCode = itemName.includes("\u6b20\u6b3e") || itemName.includes("\u00e6\u00ac")
            ? "admin_add_owed"
            : "user_pay_owed";
    } else if (itemName.includes("\u589e\u52a0") || itemName.includes("\u00e5\u00a2\u009e\u00e5\u008a\u00a0")) {
        historyCode = itemName.includes("\u6b20\u6b3e") || itemName.includes("\u00e6\u00ac") ? "admin_add_owed" : "admin_add_coin";
    } else if (itemName.includes("\u51cf\u5c11") || itemName.includes("\u6263\u9664") || itemName.includes("\u00e5\u0087\u008f\u00e5\u00b0\u0091") || itemName.includes("\u00e6\u0089\u00a3\u00e9\u0099\u00a4")) {
        historyCode = itemName.includes("\u6b20\u6b3e") || itemName.includes("\u00e6\u00ac") ? "admin_minus_owed" : "admin_minus_coin";
    }
    const [type, amount] = codes[historyCode] || ["purchase", -value];
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
