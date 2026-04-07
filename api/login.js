const { buildState, diffDays, getAuthorizedActor, getShopStateRow, requireRole, upsertShopState } = require("../lib/supabaseAdmin");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const actor = await getAuthorizedActor(req);

        if (actor.role === "shopper") {
            const nowIso = new Date().toISOString();
            const existingRow = await getShopStateRow();
            const daysPassed = diffDays(existingRow?.last_login, new Date());
            const currentCoins = Number(existingRow?.coins || 0);

            await upsertShopState({
                coins: currentCoins + daysPassed,
                last_login: nowIso
            });
        } else {
            requireRole(actor, "admin");
        }

        const state = await buildState(actor);
        return res.status(200).json(state);
    } catch (error) {
        return res.status(401).json({ error: error.message || "Login failed" });
    }
};
