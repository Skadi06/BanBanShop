const { buildState, getAuthorizedActor, getShopStateRow, requireRole, supabaseAdmin, upsertShopState } = require("../lib/supabaseAdmin");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const actor = await getAuthorizedActor(req);
        requireRole(actor, "shopper");

        const shopRow = await getShopStateRow();
        const coins = Number(shopRow?.coins || 0);
        const owed = Number(shopRow?.coins_owed || 0);

        if (owed <= 0) {
            return res.status(400).json({ error: "No Banban Coin is owed" });
        }

        if (coins < owed) {
            return res.status(400).json({ error: "Not enough Banban Coin to pay the amount owed" });
        }

        await upsertShopState({
            coins: coins - owed,
            coins_owed: 0,
            last_login: shopRow?.last_login || new Date().toISOString()
        });

        const { error } = await supabaseAdmin.from("shop_purchases").insert({
            product: "Banban Coin owed payment",
            price: owed
        });
        if (error) throw error;

        return res.status(200).json(await buildState(actor));
    } catch (error) {
        return res.status(400).json({ error: error.message || "Owed payment failed" });
    }
};
