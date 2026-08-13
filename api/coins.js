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
    } else if (mode === "increment_owed") {
      const amount = Number(req.body?.amount);
      const currentOwed = Number(shopRow?.coins_owed || 0);
      const nextOwed = currentOwed + amount;
      if (!Number.isInteger(amount) || amount === 0) {
        return res.status(400).json({ error: "Invalid owed amount" });
      }
      if (nextOwed < 0) {
        return res.status(400).json({ error: "Owed balance cannot go below zero" });
      }

      await upsertShopState({
        coins: currentCoins,
        coins_owed: nextOwed,
        last_login: shopRow?.last_login || new Date().toISOString()
      });

      const { error: historyError } = await supabaseAdmin.from("shop_purchases").insert({
        product: amount > 0 ? "BanBan欠款" : "BanBan还款",
        price: amount
      });
      if (historyError) throw historyError;

      return res.status(200).json(await buildState(actor));
    } else if (mode === "set_owed") {
      const amount = Number(req.body?.amount);
      if (!Number.isInteger(amount) || amount < 0) {
        return res.status(400).json({ error: "Invalid owed amount" });
      }

      await upsertShopState({
        coins: currentCoins,
        coins_owed: amount,
        last_login: shopRow?.last_login || new Date().toISOString()
      });

      const state = await buildState(actor);
      return res.status(200).json(state);
    } else {
      return res.status(400).json({ error: "Invalid mode" });
    }

    if (nextCoins < 0) {
      return res.status(400).json({ error: "Balance cannot go below zero" });
    }

    await upsertShopState({
      coins: nextCoins,
      coins_owed: Number(shopRow?.coins_owed || 0),
      last_login: shopRow?.last_login || new Date().toISOString()
    });

    const historyLabel = historyPrice >= 0 ? "兔兔银行增加" : "兔兔银行减少";
    const { error: historyError } = await supabaseAdmin.from("shop_purchases").insert({
      product: historyLabel,
      price: historyPrice
    });

    if (historyError) throw historyError;

    const state = await buildState(actor);
    return res.status(200).json(state);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Coin update failed" });
  }
};

