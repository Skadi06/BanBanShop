const SESSION_KEY = "banban_session_token";

function getAccessToken() {
    return localStorage.getItem(SESSION_KEY);
}

function setAccessToken(token) {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
}

async function apiFetch(path, body) {
    const token = getAccessToken();
    const response = await fetch(path, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body || {})
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error || "Request failed");
    }

    return payload;
}

function isAdminCoinHistory(productName) {
    return /兔兔银行.*(增加|扣除)|banban币/i.test(String(productName || ""));
}

function mapPurchaseToHistoryRow(purchase) {
    const itemName = String(purchase.product || "");
    const rawAmount = Number(purchase.price) || 0;
    const isAdminHistory = isAdminCoinHistory(itemName);
    const isAdminDeduction = /扣除/.test(itemName);
    const isAdminAddition = /增加/.test(itemName);

    let amount = -Math.abs(rawAmount);
    let type = "purchase";

    if (isAdminHistory) {
        type = "admin_adjustment";

        if (rawAmount < 0 || isAdminDeduction) {
            amount = -Math.abs(rawAmount);
        } else if (rawAmount > 0 || isAdminAddition) {
            amount = Math.abs(rawAmount);
        } else {
            amount = 0;
        }
    }

    return {
        ts: purchase.created_at,
        type,
        amount,
        itemId: itemName,
        itemName
    };
}

function normalizeState(payload) {
    return {
        viewer: payload.viewer || null,
        shopper: payload.shopper || { username: null, coins: 0, last_login: null },
        balance: Number(payload.shopper?.coins || 0),
        history: Array.isArray(payload.history) ? payload.history.map(mapPurchaseToHistoryRow) : []
    };
}

async function getState() {
    const token = getAccessToken();
    if (!token) {
        return {
            viewer: null,
            shopper: { username: null, coins: 0, last_login: null },
            balance: 0,
            history: []
        };
    }

    const payload = await apiFetch("/api/history");
    return normalizeState(payload);
}

async function setBalance(balance) {
    if (!Number.isInteger(balance) || balance < 0) {
        throw new Error("balance_must_be_non_negative_integer");
    }

    const payload = await apiFetch("/api/coins", { mode: "set", balance });
    return normalizeState(payload);
}

async function addCoins(amount) {
    if (!Number.isInteger(amount) || amount === 0) {
        throw new Error("amount_must_be_non_zero_integer");
    }

    const payload = await apiFetch("/api/coins", { mode: "increment", amount });
    return normalizeState(payload);
}

async function purchase({ itemName, price, quantity }) {
    if (!itemName) throw new Error("missing_item_fields");
    if (!Number.isInteger(price) || price <= 0) throw new Error("price_must_be_positive_integer");
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("quantity_must_be_positive_integer");

    const payload = await apiFetch("/api/buy", { product: itemName, price, quantity });
    return normalizeState(payload);
}

async function signIn(username, password) {
    const payload = await apiFetch("/api/auth-login", { username, password });
    setAccessToken(payload.access_token);
    return await login();
}

async function signOut() {
    setAccessToken(null);
}

async function login() {
    const payload = await apiFetch("/api/login");
    return normalizeState(payload);
}

async function getSessionUser() {
    return getAccessToken() ? { loggedIn: true } : null;
}

window.BanbanAuth = {
    signIn,
    signOut,
    login,
    getSessionUser
};

window.BanbanStore = {
    getState,
    setBalance,
    addCoins,
    purchase
};
