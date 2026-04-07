const { buildState, getAuthorizedActor, getShopStateRow, requireRole, supabaseAdmin, upsertShopState } = require("../lib/supabaseAdmin");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const actor = await getAuthorizedActor(req);
        requireRole(actor, "shopper");

        const product = String(req.body?.product || "").trim();
        const price = Number(req.body?.price);
        const quantity = Number(req.body?.quantity);

        if (!product) {
            return res.status(400).json({ error: "Missing product" });
        }

        if (!Number.isInteger(price) || price <= 0) {
            return res.status(400).json({ error: "Invalid price" });
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
            return res.status(400).json({ error: "Invalid quantity" });
        }

        const totalPrice = price * quantity;
        const shopRow = await getShopStateRow();
        const currentCoins = Number(shopRow?.coins || 0);
        if (currentCoins < totalPrice) {
            return res.status(400).json({ error: "Not enough coins" });
        }

        await upsertShopState({
            coins: currentCoins - totalPrice,
            last_login: shopRow?.last_login || new Date().toISOString()
        });

        const { error: purchaseError } = await supabaseAdmin.from("shop_purchases").insert({
            product: quantity > 1 ? `${product} x${quantity}` : product,
            price: totalPrice
        });

        if (purchaseError) throw purchaseError;

        const state = await buildState(actor);
        return res.status(200).json(state);
    } catch (error) {
        return res.status(400).json({ error: error.message || "Purchase failed" });
    }
};
