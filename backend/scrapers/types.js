export const USD_TO_CAD_RATE = 1.36;
export function convertToCAD(amount, currency) {
    if (currency === 'CAD')
        return amount;
    return Math.round(amount * USD_TO_CAD_RATE);
}
export function generateListingId(source, identifier) {
    return `${source}-${identifier}-${Date.now()}`;
}
export function extractSize(text) {
    const sizeMatch = text.match(/(?:size|sz|us)\s*:?\s*(\d+(?:\.\d+)?)/i);
    return sizeMatch ? sizeMatch[1] : undefined;
}
export const MOCK_SNEAKER_DB = [
    {
        name: 'Jordan 1 Retro High OG Chicago Lost and Found',
        brand: 'Jordan',
        colorway: 'Varsity Red/Black-Sail-Muslin',
        sku: 'DZ5485-612',
        priceUSD: 215,
        priceCAD: 292,
        keywords: ['jordan', 'jordan 1', 'chicago', 'lost and found', 'retro', 'high', 'og', '1'],
    },
    {
        name: 'Nike Dunk Low Retro White Black Panda',
        brand: 'Nike',
        colorway: 'White/Black-White',
        sku: 'DD1391-100',
        priceUSD: 105,
        priceCAD: 143,
        keywords: ['nike', 'dunk', 'dunk low', 'panda', 'black', 'white', 'retro'],
    },
    {
        name: 'Adidas Yeezy Boost 350 V2 Onyx',
        brand: 'Adidas',
        colorway: 'Onyx/Onyx/Onyx',
        sku: 'HQ4540',
        priceUSD: 235,
        priceCAD: 320,
        keywords: ['adidas', 'yeezy', '350', 'v2', 'onyx', 'boost'],
    },
    {
        name: 'New Balance 550 White Green',
        brand: 'New Balance',
        colorway: 'White/Green',
        sku: 'BB550WT1',
        priceUSD: 120,
        priceCAD: 163,
        keywords: ['new balance', 'nb', '550', 'white', 'green'],
    },
    {
        name: 'Nike Air Force 1 Low White',
        brand: 'Nike',
        colorway: 'White/White',
        sku: 'CW2288-111',
        priceUSD: 100,
        priceCAD: 136,
        keywords: ['nike', 'air force', 'af1', 'force 1', 'white', 'low'],
    },
    {
        name: 'Jordan 4 Retro Thunder',
        brand: 'Jordan',
        colorway: 'Black/Tour Yellow',
        sku: 'DH6927-017',
        priceUSD: 280,
        priceCAD: 381,
        keywords: ['jordan', 'jordan 4', '4', 'thunder', 'retro', 'black', 'yellow'],
    },
    {
        name: 'Adidas Samba OG White',
        brand: 'Adidas',
        colorway: 'Cloud White/Core Black/Clear Granite',
        sku: 'B75806',
        priceUSD: 100,
        priceCAD: 140,
        keywords: ['adidas', 'samba', 'og', 'white', 'classic'],
    },
    {
        name: 'Nike Air Max 1 86 Big Bubble',
        brand: 'Nike',
        colorway: 'White/University Red-Neutral Grey',
        sku: 'DQ3989-100',
        priceUSD: 145,
        priceCAD: 197,
        keywords: ['nike', 'air max', 'max 1', '86', 'big bubble', 'red'],
    },
    {
        name: 'Jordan 11 Retro Cherry',
        brand: 'Jordan',
        colorway: 'White/Varsity Red-Black',
        sku: 'CT8012-116',
        priceUSD: 240,
        priceCAD: 326,
        keywords: ['jordan', 'jordan 11', '11', 'cherry', 'retro', 'red', 'white'],
    },
    {
        name: 'Nike SB Dunk Low Pro',
        brand: 'Nike',
        colorway: 'Various',
        sku: 'BQ6817',
        priceUSD: 130,
        priceCAD: 177,
        keywords: ['nike', 'sb', 'dunk', 'dunk low', 'pro', 'skate'],
    },
    {
        name: 'Adidas Campus 00s Core Black',
        brand: 'Adidas',
        colorway: 'Core Black/Cloud White',
        sku: 'HQ8708',
        priceUSD: 110,
        priceCAD: 150,
        keywords: ['adidas', 'campus', '00s', 'black', 'white'],
    },
    {
        name: 'New Balance 2002R Protection Pack Rain Cloud',
        brand: 'New Balance',
        colorway: 'Rain Cloud',
        sku: 'M2002RDA',
        priceUSD: 180,
        priceCAD: 245,
        keywords: ['new balance', 'nb', '2002r', 'protection', 'rain', 'cloud', 'grey'],
    },
];
export function searchMockDB(query, priceVariation = 0) {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    const scored = MOCK_SNEAKER_DB.map(product => {
        let score = 0;
        for (const word of queryWords) {
            if (word.length < 2)
                continue;
            if (product.keywords.some(kw => kw.includes(word)))
                score += 2;
            if (product.brand.toLowerCase().includes(word))
                score += 3;
            if (product.name.toLowerCase().includes(word))
                score += 2;
            if (product.sku.toLowerCase().includes(word))
                score += 5;
        }
        return { product, score };
    });
    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ product }) => ({
        ...product,
        priceUSD: product.priceUSD + priceVariation,
        priceCAD: product.priceCAD + Math.round(priceVariation * USD_TO_CAD_RATE),
    }));
}
//# sourceMappingURL=types.js.map