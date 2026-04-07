const { createSessionToken, getAccountByUsername } = require("../lib/supabaseAdmin");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const username = String(req.body?.username || "").trim();
        const password = String(req.body?.password || "");

        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required" });
        }

        const account = getAccountByUsername(username);
        if (!account || account.password !== password) {
            return res.status(401).json({ error: "Invalid username or password" });
        }

        return res.status(200).json({
            access_token: createSessionToken(account)
        });
    } catch (error) {
        return res.status(400).json({ error: error.message || "Login failed" });
    }
};
