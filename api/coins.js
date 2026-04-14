const {
  buildState,
  getAuthorizedActor,
  getShopStateRow,
  requireRole,
  supabaseAdmin,
  upsertShopState
} = require("../lib/supabaseAdmin");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const actor = await getAuthorizedActor(req);
    requireRole(actor, "admin");

    const shopRow = await getShopStateRow();
    const currentCoins = Number(shopRow?.coins || 0);
    const mode = req.body?.mode;

    let nextCoins = currentCoins;
    let historyProduct = "";
    let historyPrice = 0;
    if (mode === "increment") {
      const amount = Number(req.body?.amount);
      if (!Number.isInteger(amount) || amount === 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      nextCoins = currentCoins + amount;
      if (amount > 0) {
        historyProduct = `兔兔银行增加 ${amount} banban币`;
        historyPrice = amount;
      } else {
        historyProduct = `兔兔银行扣除 ${Math.abs(amount)} banban币`;
        historyPrice = amount;
      }
    } else {
      return res.status(400).json({ error: "Invalid mode" });
    }

    if (nextCoins < 0) {
      return res.status(400).json({ error: "Balance cannot go below zero" });
    }

    await upsertShopState({
      coins: nextCoins,
      last_login: shopRow?.last_login || new Date().toISOString()
    });

    const { error: historyError } = await supabaseAdmin.from("shop_purchases").insert({
      product: historyProduct,
      price: historyPrice
    });

    if (historyError) throw historyError;

    const state = await buildState(actor);
    return res.status(200).json(state);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Coin update failed" });
  }
};

