const { buildState, getAuthorizedActor, getShopStateRow, requireRole, supabaseAdmin, upsertShopState } = require("../lib/supabaseAdmin");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const actor = await getAuthorizedActor(req);
    requireRole(actor, "shopper");

    const shopRow = await getShopStateRow();
    const coins = Number(shopRow?.coins || 0);
    const owed = Number(shopRow?.coins_owed || 0);
    const amount = Number(req.body?.amount);

    if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: "Enter a valid payment amount" });
    if (amount > owed) return res.status(400).json({ error: "Payment cannot exceed the amount owed" });
    if (amount > coins) return res.status(400).json({ error: "Not enough Banban Coin" });

    await upsertShopState({
      coins: coins - amount,
      coins_owed: owed - amount,
      last_login: shopRow?.last_login || new Date().toISOString()
    });

    const { error } = await supabaseAdmin.from("shop_purchases").insert({ product: "用户偿还欠款", price: amount });
    if (error) throw error;

    return res.status(200).json(await buildState(actor));
  } catch (error) {
    return res.status(400).json({ error: error.message || "Payment failed" });
  }
};
