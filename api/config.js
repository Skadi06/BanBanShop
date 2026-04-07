function toNonEmptyString(value, fallback = "") {
    const normalized = String(value || "").trim();
    return normalized || fallback;
}

function normalizeItem(rawItem, index) {
    const fallbackItem = {
        id: `item${index + 1}`,
        name: `Item ${index + 1}`,
        img: `assets/item${index + 1}.png`,
        price: 10 + index * 2,
        status: "for_sale"
    };

    const normalizedStatus = String(rawItem?.status || fallbackItem.status).trim().toLowerCase();
    const normalizedLimit = Number(rawItem?.limit);

    return {
        id: toNonEmptyString(rawItem?.id, fallbackItem.id),
        name: toNonEmptyString(rawItem?.name, fallbackItem.name),
        img: toNonEmptyString(rawItem?.img, fallbackItem.img),
        price: Number.isInteger(rawItem?.price) && rawItem.price > 0 ? rawItem.price : fallbackItem.price,
        status: ["for_sale", "limited", "sold_out", "seasonal", "coming_soon"].includes(normalizedStatus)
            ? normalizedStatus
            : fallbackItem.status,
        limit: Number.isInteger(normalizedLimit) && normalizedLimit > 0 ? normalizedLimit : null,
        badgeText: toNonEmptyString(rawItem?.badgeText, ""),
        multipleBuy: rawItem?.multipleBuy === true
    };
}

function getDefaultItems() {
    return [
        { id: "item1", name: "2RMB", img: "assets/IMG_8492.JPG", price: 1, status: "for_sale", multipleBuy: true },
        { id: "item2", name: "1美金", img: "assets/item2.png", price: 1, status: "for_sale", multipleBuy: true },
        { id: "item3", name: "星ban克", img: "assets/xingbanke.png", price: 4, status: "for_sale", multipleBuy: false },
        { id: "item4", name: "banbanの口粮", img: "assets/item4.png", price: 45, status: "for_sale", multipleBuy: false },
        { id: "item5", name: "banban宅家送", img: "assets/item3.jpg", price: 10, status: "for_sale", multipleBuy: false },
        { id: "item6", name: "1日ban神头衔体验卡：《聪慧的》", img: "assets/conghui.png", price: 1, status: "limited", limit: 5, multipleBuy: false },
        { id: "item7", name: "???", img: "assets/item7.png", price: 28, status: "sold_out", multipleBuy: false },
        { id: "item8", name: "???", img: "assets/item8.png", price: 30, status: "sold_out", multipleBuy: false },
        { id: "item9", name: "???", img: "assets/item9.png", price: 35, status: "sold_out", multipleBuy: false },
        { id: "item10", name: "???", img: "assets/item10.png", price: 40, status: "sold_out", multipleBuy: false },
        { id: "item11", name: "???", img: "assets/item11.png", price: 45, status: "sold_out", multipleBuy: false },
        { id: "item12", name: "ipad Pro", img: "assets/item12.png", price: 650, status: "coming_soon", multipleBuy: false }
    ];
}

function getPublicConfig() {
    const defaultConfig = {
        coinImage: "assets/bancoin.png",
        badge: {
            show: true,
            text: "For sale"
        },
        items: getDefaultItems()
    };

    const configuredCoinImage = toNonEmptyString(process.env.PUBLIC_COIN_IMAGE_URL, defaultConfig.coinImage);
    const configuredBadgeText = toNonEmptyString(process.env.PUBLIC_BADGE_TEXT, defaultConfig.badge.text);
    const configuredBadgeShow = String(process.env.PUBLIC_BADGE_SHOW || "").trim().toLowerCase() !== "false";
    const configuredItems = String(process.env.PUBLIC_SHOP_ITEMS_JSON || "").trim();

    if (!configuredItems) {
        return {
            coinImage: configuredCoinImage,
            badge: {
                show: configuredBadgeShow,
                text: configuredBadgeText
            },
            items: defaultConfig.items
        };
    }

    try {
        const parsedItems = JSON.parse(configuredItems);
        if (!Array.isArray(parsedItems) || !parsedItems.length) {
            throw new Error("PUBLIC_SHOP_ITEMS_JSON must be a non-empty JSON array");
        }

        return {
            coinImage: configuredCoinImage,
            badge: {
                show: configuredBadgeShow,
                text: configuredBadgeText
            },
            items: parsedItems.map(normalizeItem)
        };
    } catch (error) {
        throw new Error(error.message || "Invalid PUBLIC_SHOP_ITEMS_JSON");
    }
}

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        return res.status(200).json(getPublicConfig());
    } catch (error) {
        return res.status(500).json({ error: error.message || "Config failed" });
    }
};
