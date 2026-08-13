const {
  buildState,
  getAuthorizedActor,
  getShopStateRow,
  requireRole,
  supabaseAdmin,
  upsertShopState
} = require("../lib/supabaseAdmin");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const actor = await getAuthorizedActor(req);
    requireRole(actor, "admin");

    const shopRow = await getShopStateRow();
    const coins = Number(shopRow?.coins || 0);
    const owed = Number(shopRow?.coins_owed || 0);
    const amount = Number(req.body?.amount);
    const mode = req.body?.mode;

    if (!Number.isInteger(amount) || amount === 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    let nextCoins = coins;
    let nextOwed = owed;
    let historyProduct = "";

    if (mode === "increment") {
      nextCoins = coins + amount;
      if (nextCoins < 0) return res.status(400).json({ error: "Balance cannot go below zero" });
      historyProduct = amount > 0 ? "管理员增加 Banban币" : "管理员减少 Banban币";
    } else if (mode === "increment_owed") {
      nextOwed = owed + amount;
      if (nextOwed < 0) return res.status(400).json({ error: "Owed balance cannot go below zero" });
      historyProduct = amount > 0 ? "管理员增加欠款" : "管理员减少欠款";
    } else {
      return res.status(400).json({ error: "Invalid mode" });
    }

    await upsertShopState({
      coins: nextCoins,
      coins_owed: nextOwed,
      last_login: shopRow?.last_login || new Date().toISOString()
    });

    const { error } = await supabaseAdmin.from("shop_purchases").insert({
      product: historyProduct,
      price: amount
    });
    if (error) throw error;

    return res.status(200).json(await buildState(actor));
  } catch (error) {
    return res.status(400).json({ error: error.message || "Coin update failed" });
  }
};
