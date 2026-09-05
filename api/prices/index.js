module.exports = async function (context, req) {
    try {
        const url =
            "https://prices.azure.com/api/retail/prices" +
            "?$filter=serviceName%20eq%20%27Virtual%20Machines%27" +
            "%20and%20armRegionName%20eq%20%27westeurope%27";

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Retail Prices API hiba: ${response.status}`);
        }

        const data = await response.json();

        context.res = {
            status: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: data
        };

    } catch (err) {
        context.log.error("Retail Prices API hiba:", err.message);

        context.res = {
            status: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: {
                error: "Nem sikerült lekérni az Azure árakat."
            }
        };
    }
};