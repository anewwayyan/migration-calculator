const { TableClient } = require("@azure/data-tables");

const TABLE_NAME = "leads";

module.exports = async function (context, req) {
	const body = req.body || {};
	const { name, email, company, phone, summary } = body;

	if (!name || !email || !company) {
		context.res = { status: 400, body: { error: "Hiányzó kötelező mező (név, email, cég)." } };
		return;
	}

	const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

	if (!connectionString) {
		context.res = {
			status: 500,
			body: { error: "Szerver konfigurációs hiba (hiányzó Storage connection string)." }
		};
		return;
	}

	try {
		const tableClient = TableClient.fromConnectionString(connectionString, TABLE_NAME, {
			allowInsecureConnection: false
		});

		try {
			await tableClient.createTable();
		} catch (e) {
			// már létezik, ez rendben van
		}

		const entity = {
			partitionKey: "lead",
			rowKey: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			name,
			email,
			company,
			phone: phone || "",
			summaryJson: JSON.stringify(summary || {}),
			createdAt: new Date().toISOString()
		};

		await tableClient.createEntity(entity);

		context.res = {
			status: 200,
			headers: { "Content-Type": "application/json" },
			body: { success: true }
		};
	} catch (err) {
		context.log.error("Table Storage hiba:", err.message);
		context.res = {
			status: 500,
			body: { error: "Nem sikerült elmenteni a leadet." }
		};
	}
};