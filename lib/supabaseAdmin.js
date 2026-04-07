const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
}

function getAppConfig() {
    const shopperUsername = normalizeUsername(process.env.APP_USER_USERNAME);
    const shopperPassword = String(process.env.APP_USER_PASSWORD || "");
    const adminUsername = normalizeUsername(process.env.APP_ADMIN_USERNAME);
    const adminPassword = String(process.env.APP_ADMIN_PASSWORD || "");
    const sessionSecret = String(process.env.APP_SESSION_SECRET || "");

    if (!shopperUsername || !shopperPassword || !adminUsername || !adminPassword || !sessionSecret) {
        throw new Error(
            "Missing APP_USER_USERNAME, APP_USER_PASSWORD, APP_ADMIN_USERNAME, APP_ADMIN_PASSWORD, or APP_SESSION_SECRET"
        );
    }

    if (shopperUsername === adminUsername) {
        throw new Error("APP_USER_USERNAME and APP_ADMIN_USERNAME must be different");
    }

    return {
        shopperUsername,
        shopperPassword,
        adminUsername,
        adminPassword,
        sessionSecret
    };
}

function getAccountByUsername(username) {
    const normalized = normalizeUsername(username);
    const { shopperUsername, shopperPassword, adminUsername, adminPassword } = getAppConfig();

    if (normalized === shopperUsername) {
        return { role: "shopper", username: shopperUsername, password: shopperPassword };
    }

    if (normalized === adminUsername) {
        return { role: "admin", username: adminUsername, password: adminPassword };
    }

    return null;
}

function encodeBase64Url(value) {
    return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value) {
    return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload, secret) {
    return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSessionToken(account) {
    const { sessionSecret } = getAppConfig();
    const now = Date.now();
    const payload = encodeBase64Url(
        JSON.stringify({
            role: account.role,
            username: account.username,
            exp: now + 1000 * 60 * 60 * 24 * 30
        })
    );
    const signature = signPayload(payload, sessionSecret);
    return `${payload}.${signature}`;
}

function verifySessionToken(token) {
    if (!token || !token.includes(".")) {
        throw new Error("Unauthorized");
    }

    const [payload, signature] = token.split(".");
    const { sessionSecret, shopperUsername, adminUsername } = getAppConfig();
    const expectedSignature = signPayload(payload, sessionSecret);

    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
        providedBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
        throw new Error("Unauthorized");
    }

    const parsed = JSON.parse(decodeBase64Url(payload));
    if (!parsed?.username || !parsed?.role || !parsed?.exp || Date.now() > parsed.exp) {
        throw new Error("Unauthorized");
    }

    if (parsed.role === "shopper" && parsed.username === shopperUsername) {
        return { role: "shopper", username: shopperUsername, adminUsername };
    }

    if (parsed.role === "admin" && parsed.username === adminUsername) {
        return { role: "admin", username: adminUsername, shopperUsername };
    }

    throw new Error("Unauthorized");
}

function getAuthorizedActor(req) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    return verifySessionToken(token);
}

function requireRole(actor, role) {
    if (actor.role !== role) {
        throw new Error(role === "admin" ? "Admin account required" : "Shopper account required");
    }
}

const DAILY_RESET_TIME_ZONE = "America/Chicago";
const chicagoDayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_RESET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
});

function getCalendarDayKey(date) {
    return chicagoDayFormatter.format(date);
}

function diffDays(lastLoginIso, now = new Date()) {
    if (!lastLoginIso) return 0;

    const last = new Date(lastLoginIso);
    const lastDayKey = getCalendarDayKey(last);
    const nowDayKey = getCalendarDayKey(now);

    if (lastDayKey >= nowDayKey) {
        return 0;
    }

    let days = 0;
    const cursor = new Date(last);

    while (getCalendarDayKey(cursor) < nowDayKey) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        days += 1;
    }

    return days;
}

async function getShopStateRow() {
    const { data, error } = await supabaseAdmin
        .from("shop_state")
        .select("id, coins, last_login")
        .eq("id", 1)
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function upsertShopState(values) {
    const payload = {
        id: 1,
        ...values
    };

    const { data, error } = await supabaseAdmin
        .from("shop_state")
        .upsert(payload)
        .select("id, coins, last_login")
        .single();

    if (error) throw error;
    return data;
}

async function getHistory() {
    const { data, error } = await supabaseAdmin
        .from("shop_purchases")
        .select("id, product, price, created_at")
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
}

async function buildState(actor) {
    const [shopRow, history] = await Promise.all([getShopStateRow(), getHistory()]);
    const { shopperUsername } = getAppConfig();

    return {
        viewer: {
            username: actor.username,
            role: actor.role
        },
        shopper: {
            username: shopperUsername,
            coins: Number(shopRow?.coins || 0),
            last_login: shopRow?.last_login || null
        },
        history
    };
}

module.exports = {
    buildState,
    createSessionToken,
    DAILY_RESET_TIME_ZONE,
    diffDays,
    getAccountByUsername,
    getAuthorizedActor,
    getHistory,
    getShopStateRow,
    normalizeUsername,
    requireRole,
    supabaseAdmin,
    upsertShopState
};
