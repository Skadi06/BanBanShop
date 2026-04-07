const fallbackConfig = {
    coinImage: "assets/bancoin.png",
    badge: {
        show: true,
        text: "For sale"
    },
    items: [
        { id: "item1", name: "2RMB", img: "assets/IMG_8492.JPG", price: 1, status: "for_sale", multipleBuy: true },
        { id: "item2", name: "1美金", img: "assets/item2.png", price: 1, status: "for_sale", multipleBuy: true },
        { id: "item3", name: "星ban克", img: "assets/xingbanke.png", price: 4, status: "for_sale", multipleBuy: false },
        { id: "item4", name: "banbanの口粮", img: "assets/item4.png", price: 45, status: "for_sale", multipleBuy: false },
        { id: "item5", name: "banban宅家送", img: "assets/item3.jpg", price: 10, status: "for_sale", multipleBuy: false },
        { id: "item6", name: "1日ban神头衔体验卡：《聪慧的》", img: "assets/conghui.png", price: 1, status: "limited", limit: 5, multipleBuy: false },
        { id: "item7", name: "???", img: "assets/item7.png", price: 28, status: "sold_out", multipleBuy: false },
        { id: "item8", name: "???", img: "assets/item8.png", price: 30, status: "sold_out", multipleBuy: false },
        { id: "item9", name: "???", img: "assets/item9.png", price: 35, status: "sold_out", multipleBuy: false },
        { id: "item10", name: "???", img: "assets/item10.png", price: 40, status: "sold_out", multipleBuy: false },
        { id: "item11", name: "???", img: "assets/item11.png", price: 45, status: "sold_out", multipleBuy: false },
        { id: "item12", name: "ipad Pro", img: "assets/item12.png", price: 650, status: "coming_soon", multipleBuy: false }
    ]
};

let appConfig = fallbackConfig;

const $ = (sel) => document.querySelector(sel);
const grid = $("#grid");
const historyEl = $("#history");
const balanceEl = $("#balance");
const coinIconEl = $("#banbanCoinIcon");
const toast = $("#toast");
const adminBtn = $("#adminBtn");
const adminDialog = $("#adminDialog");
const adminLockedWrap = $("#adminLocked");
const adminPanelWrap = $("#adminPanel");
const adminMessage = $("#adminMessage");
const adminAddAmount = $("#adminAddAmount");
const adminAddBtn = $("#adminAddBtn");
const adminMinusBtn = $("#adminMinusBtn");
const authStatus = $("#authStatus");
const loginBtn = $("#loginBtn");
const logoutBtn = $("#logoutBtn");
const authDialog = $("#authDialog");
const authUsernameInput = $("#authUsername");
const authPasswordInput = $("#authPassword");
const signinBtn = $("#signinBtn");
const quantityDialog = $("#quantityDialog");
const quantityDialogSubtitle = $("#quantityDialogSubtitle");
const quantityInput = $("#quantityInput");
const quantitySummary = $("#quantitySummary");
const quantityConfirmBtn = $("#quantityConfirmBtn");
const quantityItemName = $("#quantityItemName");
const quantityItemPrice = $("#quantityItemPrice");
const quantityCoinIcon = $("#quantityCoinIcon");
const quantityDecreaseBtn = $("#quantityDecreaseBtn");
const quantityIncreaseBtn = $("#quantityIncreaseBtn");

let state = {
    viewer: null,
    shopper: { username: null, coins: 0, last_login: null },
    balance: 0,
    history: []
};

let pendingPurchaseItem = null;
let pendingPurchaseButton = null;
let isSubmittingQuantityPurchase = false;

function normalizeItem(item) {
    return {
        ...item,
        multipleBuy: item?.multipleBuy === true
    };
}

async function loadAppConfig() {
    try {
        const response = await fetch("/api/config");
        if (!response.ok) throw new Error("config_request_failed");

        const payload = await response.json();
        if (!payload || !Array.isArray(payload.items) || !payload.items.length) {
            throw new Error("config_payload_invalid");
        }

        appConfig = {
            coinImage: payload.coinImage || fallbackConfig.coinImage,
            badge: {
                show: payload.badge?.show !== false,
                text: payload.badge?.text || fallbackConfig.badge.text
            },
            items: payload.items.map(normalizeItem)
        };
    } catch (_error) {
        appConfig = {
            ...fallbackConfig,
            items: fallbackConfig.items.map(normalizeItem)
        };
    }
}

function fmtTs(ts) {
    const d = new Date(ts);
    return d.toLocaleString();
}

let toastTimer = null;
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("toast--show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("toast--show"), 1800);
}

function isAdminViewer() {
    return state.viewer?.role === "admin";
}

function isShopperViewer() {
    return state.viewer?.role === "shopper";
}

function getPurchaseCount(item) {
    return (state.history || []).filter((entry) => entry.type === "purchase" && entry.itemName === item.name).length;
}

function getItemBadge(item) {
    const status = String(item.status || "for_sale").trim().toLowerCase();
    const limitedCount = Number(item.limit);
    const purchaseCount = getPurchaseCount(item);

    if (status === "sold_out") {
        return { show: true, text: "Sold Out", available: false };
    }

    if (status === "coming_soon") {
        return { show: true, text: "Coming Soon", available: false };
    }

    if (status === "seasonal") {
        return { show: true, text: "Seasonal", available: true };
    }

    if (status === "limited") {
        const maxPurchases = Number.isInteger(limitedCount) && limitedCount > 0 ? limitedCount : 1;
        const remaining = Math.max(0, maxPurchases - purchaseCount);

        if (remaining <= 0) {
            return { show: true, text: "Sold Out", available: false };
        }

        return { show: true, text: `Limited ${remaining}`, available: true };
    }

    if (appConfig.badge?.show === false) {
        return { show: false, text: "", available: true };
    }

    return { show: true, text: item.badgeText || appConfig.badge?.text || "For sale", available: true };
}

function renderAdminDialog() {
    const adminOpen = isAdminViewer();
    if (adminLockedWrap) adminLockedWrap.hidden = adminOpen;
    if (adminPanelWrap) adminPanelWrap.hidden = !adminOpen;

    if (!adminMessage) return;

    if (!state.viewer) {
        adminMessage.textContent = "Log in with the admin account to change the shopper's Banban Coin balance.";
        return;
    }

    if (isShopperViewer()) {
        adminMessage.textContent = "You are logged in as the shopper account. Only the admin account can change coins.";
        return;
    }

    adminMessage.textContent = "You are logged in as the admin account.";
}

async function apiGetState() {
    return await window.BanbanStore.getState();
}

async function apiAdd(amount) {
    return await window.BanbanStore.addCoins(amount);
}

async function apiSet(balance) {
    return await window.BanbanStore.setBalance(balance);
}

async function apiPurchase(item) {
    return await window.BanbanStore.purchase({
        itemId: item.id,
        itemName: item.name,
        price: item.price,
        quantity: item.quantity
    });
}

function getValidatedQuantity(value) {
    const quantity = Number(String(value || "").trim());
    if (!Number.isInteger(quantity) || quantity <= 0) {
        return null;
    }

    return quantity;
}

function updateQuantitySummary() {
    if (!quantitySummary) return;

    const quantity = getValidatedQuantity(quantityInput?.value);
    if (!pendingPurchaseItem || !quantity) {
        quantitySummary.textContent = "Total: 0 Banban Coin";
        return;
    }

    quantitySummary.textContent = `Total: ${pendingPurchaseItem.price * quantity} Banban Coin`;
}

function openQuantityDialog(item, btn) {
    pendingPurchaseItem = item;
    pendingPurchaseButton = btn;
    isSubmittingQuantityPurchase = false;

    if (quantityDialogSubtitle) {
        quantityDialogSubtitle.textContent = `Choose how many ${item.name} you want to buy`;
    }

    if (quantityItemName) {
        quantityItemName.textContent = item.name;
    }

    if (quantityItemPrice) {
        quantityItemPrice.textContent = String(item.price);
    }

    if (quantityCoinIcon) {
        quantityCoinIcon.src = appConfig.coinImage;
    }

    if (quantityInput) {
        quantityInput.value = "1";
    }

    updateQuantitySummary();
    quantityDialog?.showModal();
    quantityInput?.focus();
    quantityInput?.select();
}

function setQuantityValue(nextQuantity) {
    if (!quantityInput) return;

    const safeQuantity = Number.isInteger(nextQuantity) && nextQuantity > 0 ? nextQuantity : 1;
    quantityInput.value = String(safeQuantity);
    updateQuantitySummary();
}

async function submitPurchase(item, btn, quantity) {
    const totalPrice = item.price * quantity;
    if (state.balance < totalPrice) {
        return showToast(`Not enough coins for ${item.name} x${quantity}`);
    }

    btn.disabled = true;
    try {
        state = await apiPurchase({ ...item, quantity });
        renderAll();
        showToast(`Purchased: ${item.name}${quantity > 1 ? ` x${quantity}` : ""} (-${totalPrice})`);
    } catch (e) {
        showToast(String(e?.message || "Purchase failed"));
    } finally {
        btn.disabled = false;
    }
}

function renderBalance() {
    balanceEl.textContent = String(state.balance);
}

function renderAuth() {
    const viewer = state.viewer;
    if (authStatus) {
        authStatus.textContent = viewer ? `${viewer.role === "admin" ? "Admin" : "Shopper"}: ${viewer.username}` : "Guest";
    }
    if (loginBtn) loginBtn.hidden = Boolean(viewer);
    if (logoutBtn) logoutBtn.hidden = !viewer;
}

function renderGrid() {
    grid.innerHTML = "";
    for (const item of appConfig.items) {
        const badge = getItemBadge(item);
        const canBuy = badge.available && isShopperViewer() && state.balance >= item.price;
        const badgeHtml =
            badge.show === false
                ? ""
                : `<div class="badge"><span class="badge__dot"></span>${escapeHtml(badge.text)}</div>`;

        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
      <div class="card__imgWrap">
        <img class="card__img" src="${item.img}" alt="${escapeHtml(item.name)}" />
        ${badgeHtml}
      </div>
      <div class="card__body">
        <div class="card__name">${escapeHtml(item.name)}</div>
        <div class="row">
          <div class="price">
            <img class="price__icon" src="${appConfig.coinImage}" alt="Banban Coin" />
            <span>${item.price}</span>
          </div>
          <button class="btn btn--primary" ${canBuy ? "" : "disabled"} type="button">
            Buy
          </button>
        </div>
      </div>
    `;

        const btn = card.querySelector("button");
        btn.addEventListener("click", async () => {
            if (!state.viewer) {
                authDialog?.showModal();
                return showToast("Log in first");
            }

            if (!isShopperViewer()) {
                return showToast("Only the shopper account can buy items");
            }

            if (!badge.available) {
                return showToast(
                    badge.text === "Coming Soon" ? `${item.name} is coming soon` : `${item.name} is sold out`
                );
            }

            if (item.multipleBuy) {
                openQuantityDialog(item, btn);
                return;
            }

            await submitPurchase(item, btn, 1);
        });

        grid.appendChild(card);
    }
}

function renderHistory() {
    const rows = state.history || [];
    if (!rows.length) {
        historyEl.innerHTML = `<div class="hitem"><div class="hitem__meta">No history yet.</div></div>`;
        return;
    }
    historyEl.innerHTML = "";
    for (const h of rows) {
        const amt = Number(h.amount) || 0;
        const amtClass = amt >= 0 ? "hitem__amt--pos" : "hitem__amt--neg";
        const label =
            h.type === "purchase"
                ? `Purchased ${h.itemName || "item"}`
                : h.type === "earn"
                    ? "Earned coins"
                    : h.type === "admin_adjustment"
                        ? "兔兔银行"
                        : h.type === "set_balance"
                            ? "Balance set"
                            : h.type;
        const metaLine = h.type === "purchase" || h.type === "admin_adjustment" ? `Item: ${h.itemName}` : "";

        const el = document.createElement("div");
        el.className = "hitem";
        el.innerHTML = `
      <div class="hitem__top">
        <div class="hitem__type">${escapeHtml(label)}</div>
        <div class="hitem__amt ${amtClass}">${amt >= 0 ? "+" : ""}${amt}</div>
      </div>
      <div class="hitem__meta">${escapeHtml(fmtTs(h.ts))}${metaLine ? " - " + escapeHtml(metaLine) : ""}</div>
    `;
        historyEl.appendChild(el);
    }
}

function renderAll() {
    if (coinIconEl) coinIconEl.src = appConfig.coinImage;
    renderAuth();
    renderBalance();
    renderGrid();
    renderHistory();
    renderAdminDialog();
}

function escapeHtml(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getAuthFormValues() {
    const username = String(authUsernameInput?.value || "").trim();
    const password = String(authPasswordInput?.value || "");
    return { username, password };
}

async function refreshStateAfterAuth() {
    state = await window.BanbanAuth.login();
    renderAll();
}

async function init() {
    await loadAppConfig();

    try {
        const sessionUser = await window.BanbanAuth.getSessionUser();
        state = sessionUser ? await window.BanbanAuth.login() : await apiGetState();
    } catch (_e) {
        state = { viewer: null, shopper: { username: null, coins: 0, last_login: null }, balance: 0, history: [] };
    }
    renderAll();
    renderAdminDialog();

    loginBtn?.addEventListener("click", () => {
        authDialog?.showModal();
        authUsernameInput?.focus();
    });

    logoutBtn?.addEventListener("click", async () => {
        try {
            await window.BanbanAuth.signOut();
            state = { viewer: null, shopper: { username: null, coins: 0, last_login: null }, balance: 0, history: [] };
            renderAll();
            showToast("Logged out");
        } catch (e) {
            showToast(String(e?.message || "Logout failed"));
        }
    });

    signinBtn?.addEventListener("click", async () => {
        const { username, password } = getAuthFormValues();
        if (!username || !password) return showToast("Enter username and password");

        try {
            await window.BanbanAuth.signIn(username, password);
            await refreshStateAfterAuth();
            authDialog?.close();
            authPasswordInput.value = "";
            showToast("Login success");
        } catch (e) {
            showToast(String(e?.message || "Login failed"));
        }
    });

    quantityInput?.addEventListener("input", () => {
        updateQuantitySummary();
    });

    quantityDecreaseBtn?.addEventListener("click", () => {
        const quantity = getValidatedQuantity(quantityInput?.value) || 1;
        setQuantityValue(Math.max(1, quantity - 1));
    });

    quantityIncreaseBtn?.addEventListener("click", () => {
        const quantity = getValidatedQuantity(quantityInput?.value) || 1;
        setQuantityValue(quantity + 1);
    });

    quantityConfirmBtn?.addEventListener("click", async () => {
        if (!pendingPurchaseItem || !pendingPurchaseButton) {
            quantityDialog?.close();
            return;
        }

        const item = pendingPurchaseItem;
        const btn = pendingPurchaseButton;
        const quantity = getValidatedQuantity(quantityInput?.value);
        if (!quantity) {
            return showToast("Enter a whole number greater than 0");
        }

        isSubmittingQuantityPurchase = true;
        quantityConfirmBtn.disabled = true;
        try {
            quantityDialog?.close();
            await submitPurchase(item, btn, quantity);
        } finally {
            isSubmittingQuantityPurchase = false;
            quantityConfirmBtn.disabled = false;
            pendingPurchaseItem = null;
            pendingPurchaseButton = null;
            if (quantityInput) quantityInput.value = "1";
            updateQuantitySummary();
        }
    });

    quantityInput?.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();
        await quantityConfirmBtn?.click();
    });

    quantityDialog?.addEventListener("close", () => {
        if (isSubmittingQuantityPurchase) {
            return;
        }

        pendingPurchaseItem = null;
        pendingPurchaseButton = null;
        if (quantityInput) quantityInput.value = "1";
        updateQuantitySummary();
    });

    adminBtn?.addEventListener("click", () => {
        if (!adminDialog) return;
        renderAdminDialog();
        adminDialog.showModal();
        if (isAdminViewer()) adminAddAmount?.focus();
    });

    adminAddBtn?.addEventListener("click", async () => {
        if (!isAdminViewer()) return showToast("Admin account required");
        const amount = Number(String(adminAddAmount?.value || "").trim());
        if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
            return showToast("Enter a positive integer amount");
        }
        try {
            state = await apiAdd(amount);
            renderAll();
            showToast(`Added +${amount} coins`);
            if (adminAddAmount) adminAddAmount.value = "";
            if (adminDialog?.open) adminDialog.close();
        } catch (e) {
            showToast(String(e?.message || "Failed to add coins"));
        }
    });

    adminMinusBtn?.addEventListener("click", async () => {
        if (!isAdminViewer()) return showToast("Admin account required");
        const amount = Number(String(adminAddAmount?.value || "").trim());
        if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
            return showToast("Enter a positive integer amount");
        }
        try {
            state = await apiAdd(-amount);
            renderAll();
            showToast(`Minus -${amount} coins`);
            if (adminAddAmount) adminAddAmount.value = "";
            if (adminDialog?.open) adminDialog.close();
        } catch (e) {
            showToast(String(e?.message || "Failed to minus coins"));
        }
    });
}

init();
