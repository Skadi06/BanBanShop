const { buildState, getAuthorizedActor } = require("../lib/supabaseAdmin");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const actor = await getAuthorizedActor(req);
        const state = await buildState(actor);
        return res.status(200).json(state);
    } catch (error) {
        return res.status(401).json({ error: error.message || "History failed" });
    }
};
