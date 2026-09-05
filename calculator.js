// ================== NAVIGÁCIÓ ==================
const TOTAL_STEPS = 4;
let currentStep = 1;

function showStep(step) {
	document.querySelectorAll('.step').forEach(el => el.style.display = 'none');
	document.querySelector(`.step[data-step="${step}"]`).style.display = 'block';
	document.getElementById('progress-fill').style.width = `${(step / TOTAL_STEPS) * 100}%`;
	currentStep = step;
}

function nextStep(current) {
	if (current < TOTAL_STEPS) showStep(current + 1);
}

function prevStep(current) {
	if (current > 1) showStep(current - 1);
}

// ================== KÖZELÍTŐ AZURE ÁRAK (West Europe, EUR/hó, becsült) ==================
// Megjegyzés: ezek hozzávetőleges, kerekített árak demonstrációs célra.
// Élesben érdemes az Azure Retail Prices API-val (https://prices.azure.com) friss árakat lekérni.

const APP_SERVICE_TIERS = [
	{ name: "B1", vcpu: 1, ram: 1.75, price: 13 },
	{ name: "B2", vcpu: 2, ram: 3.5, price: 26 },
	{ name: "B3", vcpu: 4, ram: 7, price: 52 },
	{ name: "P1v3", vcpu: 2, ram: 8, price: 90 },
	{ name: "P2v3", vcpu: 4, ram: 16, price: 180 },
	{ name: "P3v3", vcpu: 8, ram: 32, price: 360 },
	{ name: "P4v3 (nagyobb, egyedi méretezés)", vcpu: 16, ram: 64, price: 720 }
];

function pickAppServiceTier(vcpu, ram) {
	for (const tier of APP_SERVICE_TIERS) {
		if (tier.vcpu >= vcpu && tier.ram >= ram) return tier;
	}
	return APP_SERVICE_TIERS[APP_SERVICE_TIERS.length - 1];
}

const DB_PRICE_PER_VCPU_POSTGRES = 45; // EUR / vCPU / hó, General Purpose becslés
const DB_PRICE_PER_VCPU_MSSQL = 70;
const DB_STORAGE_PRICE_PER_GB = 0.12;

const BLOB_HOT_PER_GB = 0.018;
const BLOB_COOL_PER_GB = 0.01;
const BLOB_ARCHIVE_PER_GB = 0.002;

const BANDWIDTH_FREE_GB = 100;
const BANDWIDTH_PRICE_PER_GB = 0.08;

const BACKUP_BASE_FEE = 5;
const BACKUP_PRICE_PER_GB = 0.02;

const MONITOR_FLAT_FEE = 10;

const RESERVED_DISCOUNT = 0.30; // ~30% megtakarítás 1 éves elköteleződéssel (App Service + DB compute)

// ================== SZÁMÍTÁSI LOGIKA ==================

function calculateResults() {
	const hosting = document.getElementById('q-hosting').value;
	const region = document.getElementById('q-region').value;
	const cpu = parseFloat(document.getElementById('q-cpu').value) || 1;
	const ram = parseFloat(document.getElementById('q-ram').value) || 1;
	const storage = parseFloat(document.getElementById('q-storage').value) || 0;
	const db = document.getElementById('q-db').value;
	const bandwidth = parseFloat(document.getElementById('q-bandwidth').value) || 0;
	const users = parseFloat(document.getElementById('q-users').value) || 0;
	const uptime = document.getElementById('q-uptime').value;
	const hasBackup = document.getElementById('q-backup').value;
	const currentCost = parseFloat(document.getElementById('q-cost').value) || 0;
	const growth = document.getElementById('q-growth').value;
	const hours = parseFloat(document.getElementById('q-hours').value) || 0;
	const rate = parseFloat(document.getElementById('q-rate').value) || 0;

	// --- App Service ---
	const tier = pickAppServiceTier(cpu, ram);
	const appServiceCost = tier.price;

	// --- Adatbázis ---
	let dbCost = 0;
	let dbLabel = "Nincs";
	if (db === "postgres") {
		dbCost = cpu >= 4 ? DB_PRICE_PER_VCPU_POSTGRES * 2 : DB_PRICE_PER_VCPU_POSTGRES;
		dbCost += storage * DB_STORAGE_PRICE_PER_GB * 0.3; // feltételezve, hogy a tárhely egy része DB-adat
		dbLabel = "Azure Database for PostgreSQL Flexible Server";
	} else if (db === "mssql") {
		dbCost = cpu >= 4 ? DB_PRICE_PER_VCPU_MSSQL * 2 : DB_PRICE_PER_VCPU_MSSQL;
		dbCost += storage * DB_STORAGE_PRICE_PER_GB * 0.3;
		dbLabel = "Azure SQL Managed Instance";
	}

	// --- Storage (alap: főleg Hot) ---
	const baseStorageCost = storage * BLOB_HOT_PER_GB;

	// --- Storage optimalizált (tiering: 10% hot / 30% cool / 60% archive) ---
	const optimizedStorageCost =
		(storage * 0.10 * BLOB_HOT_PER_GB) +
		(storage * 0.30 * BLOB_COOL_PER_GB) +
		(storage * 0.60 * BLOB_ARCHIVE_PER_GB);

	// --- Sávszélesség ---
	const billableBandwidth = Math.max(0, bandwidth - BANDWIDTH_FREE_GB);
	const bandwidthCost = billableBandwidth * BANDWIDTH_PRICE_PER_GB;

	// --- Backup ---
	const backupCost = BACKUP_BASE_FEE + (storage * BACKUP_PRICE_PER_GB);

	// --- Monitor ---
	const monitorCost = MONITOR_FLAT_FEE;

	// --- Alap Azure összeg (nincs optimalizálva) ---
	const azureBaseTotal = appServiceCost + dbCost + baseStorageCost + bandwidthCost + backupCost + monitorCost;

	// --- Optimalizált Azure összeg ---
	const optimizedComputeCost = (appServiceCost + dbCost) * (1 - RESERVED_DISCOUNT);
	const azureOptimizedTotal = optimizedComputeCost + optimizedStorageCost + bandwidthCost + backupCost + monitorCost;

	// ================== MEGJELENÍTÉS: ARCHITEKTÚRA ==================
	const archList = document.getElementById('architecture-list');
	const hostingLabels = { vps: "Saját szerver / VPS", aws: "AWS", gcp: "Google Cloud", onprem: "On-prem szerver", other: "Egyéb" };

	let archHtml = `
		<div class="arch-item">
			<span class="arch-current">${hostingLabels[hosting]} (${cpu} vCPU, ${ram} GB RAM)</span>
			<span class="arch-arrow">→</span>
			<span class="arch-recommended">Azure App Service (${tier.name})</span>
		</div>
	`;

	if (db !== "none") {
		archHtml += `
			<div class="arch-item">
				<span class="arch-current">Saját ${db === 'postgres' ? 'PostgreSQL/MySQL' : 'SQL Server'}</span>
				<span class="arch-arrow">→</span>
				<span class="arch-recommended">${dbLabel}</span>
			</div>
		`;
	}

	archHtml += `
		<div class="arch-item">
			<span class="arch-current">${storage} GB tárhely</span>
			<span class="arch-arrow">→</span>
			<span class="arch-recommended">Azure Blob Storage (Hot/Cool/Archive tiering)</span>
		</div>
		<div class="arch-item">
			<span class="arch-current">${hasBackup === 'yes' ? 'Saját backup' : 'Nincs backup'}</span>
			<span class="arch-arrow">→</span>
			<span class="arch-recommended">Azure Backup</span>
		</div>
		<div class="arch-item">
			<span class="arch-current">-</span>
			<span class="arch-arrow">→</span>
			<span class="arch-recommended">Azure Monitor + riasztások</span>
		</div>
	`;

	if (growth !== "stable") {
		archHtml += `
			<div class="arch-item">
				<span class="arch-current">Manuális skálázás</span>
				<span class="arch-arrow">→</span>
				<span class="arch-recommended">Autoscaling (${growth === 'high' ? 'erős' : 'mérsékelt'} növekedéshez)</span>
			</div>
		`;
	}

	if (uptime === "critical") {
		archHtml += `
			<div class="arch-item">
				<span class="arch-current">Egy szerver</span>
				<span class="arch-arrow">→</span>
				<span class="arch-recommended">Availability Zones (99.99%+ uptime)</span>
			</div>
		`;
	}

	archList.innerHTML = archHtml;

	// ================== MEGJELENÍTÉS: KÖLTSÉG TÁBLÁZAT ==================
	const costRows = [
		["App Service / Compute", `€${appServiceCost.toFixed(0)}`, `€${appServiceCost.toFixed(0)}`, `€${(appServiceCost * (1 - RESERVED_DISCOUNT)).toFixed(0)}`],
	];
	if (db !== "none") {
		costRows.push(["Adatbázis", "-", `€${dbCost.toFixed(0)}`, `€${(dbCost * (1 - RESERVED_DISCOUNT)).toFixed(0)}`]);
	}
	costRows.push(
		["Tárhely", "-", `€${baseStorageCost.toFixed(0)}`, `€${optimizedStorageCost.toFixed(0)}`],
		["Sávszélesség", "-", `€${bandwidthCost.toFixed(0)}`, `€${bandwidthCost.toFixed(0)}`],
		["Backup", hasBackup === 'yes' ? "?" : "0 (nincs)", `€${backupCost.toFixed(0)}`, `€${backupCost.toFixed(0)}`],
		["Monitoring", "-", `€${monitorCost.toFixed(0)}`, `€${monitorCost.toFixed(0)}`]
	);

	const tableBody = document.getElementById('cost-table-body');
	tableBody.innerHTML = costRows.map(row =>
		`<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td></tr>`
	).join('') + `
		<tr style="font-weight:bold; border-top: 2px solid var(--accent);">
			<td>Összesen</td>
			<td>€${currentCost.toFixed(0)}</td>
			<td>€${azureBaseTotal.toFixed(0)}</td>
			<td>€${azureOptimizedTotal.toFixed(0)}</td>
		</tr>
	`;

	// ================== MEGTAKARÍTÁS KIEMELÉS ==================
	const monthlySavings = currentCost - azureOptimizedTotal;
	const yearlySavings = monthlySavings * 12;

	document.getElementById('savings-highlight').innerHTML = `
		<div>💰 Havi megtakarítás (optimalizált Azure-ral)</div>
		<div class="big-number">${monthlySavings >= 0 ? '€' + monthlySavings.toFixed(0) : 'Kb. hasonló költség'}</div>
		${monthlySavings >= 0 ? `<div>Éves szinten: <strong>€${yearlySavings.toFixed(0)}</strong></div>` : `<div>A megtakarítás elsősorban az üzemeltetési időben és a rugalmasságban jelentkezik, nem a nyers költségben.</div>`}
	`;

	// ================== BENEFITS TÁBLÁZAT ==================
	const benefitsRows = [
		["Infrastruktúra", hostingLabels[hosting], "Managed (Azure kezeli)"],
		["Scaling", "Manuális", growth === "stable" ? "Igény szerint állítható" : "Automatikus (autoscaling)"],
		["Backup", hasBackup === "yes" ? "Saját megoldás" : "Nincs / manuális", "Azure Backup (automatikus)"],
		["Monitoring", "Nincs / alap", "Azure Monitor (riasztásokkal)"],
		["Deployment", "Manuális", "CI/CD (GitHub Actions / Azure DevOps)"],
		["Redundancia", "Korlátozott", uptime === "critical" ? "Availability Zones (több adatközpont)" : "Régión belüli redundancia"],
		["Üzemeltetés", "Saját munkaidő", "Jelentősen kevesebb (managed szolgáltatások)"]
	];

	document.getElementById('benefits-table-body').innerHTML = benefitsRows.map(row =>
		`<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td></tr>`
	).join('');

	// ================== TCO (üzemeltetési idő) ==================
	if (hours > 0 && rate > 0) {
		const hoursSaved = hours * 0.7;
		const laborSavings = hoursSaved * rate;
		const totalMonthlyBenefit = Math.max(0, monthlySavings) + laborSavings;
		const totalYearlyBenefit = totalMonthlyBenefit * 12;

		document.getElementById('tco-highlight').innerHTML = `
			<div>⏱️ Becsült üzemeltetési idő megtakarítás</div>
			<div class="big-number">~${hoursSaved.toFixed(0)} óra/hó</div>
			<div>Ez kb. <strong>€${laborSavings.toFixed(0)}/hó</strong> munkaidő-megtakarítást jelent.</div>
			<div style="margin-top:0.8rem;">Teljes becsült havi haszon (költség + munkaidő): <strong>€${totalMonthlyBenefit.toFixed(0)}</strong></div>
			<div>Éves szinten: <strong>€${totalYearlyBenefit.toFixed(0)}</strong></div>
		`;
	} else {
		document.getElementById('tco-highlight').style.display = 'none';
	}

	// ================== KVALITATÍV ELŐNYÖK (nem csak ár) ==================
	function buildQualitativeBenefits() {
		const benefits = [];

		if (hasBackup === "no") {
			benefits.push("🛡️ Jelenleg nincs rendszeres backupod – ez komoly kockázat egy adatvesztésnél. Azure Backup automatikusan, felügyelet nélkül megoldaná.");
		}
		if (uptime === "high" || uptime === "critical") {
			benefits.push("⏱️ A magas uptime-igényedhez az Azure beépített redundanciát és automatikus failover-t tud biztosítani, amit egy saját szerveren nehéz/drága lenne magadnak megoldani.");
		}
		if (growth === "moderate" || growth === "high") {
			benefits.push('📈 Növekedésnél az automatikus skálázás azt jelenti, hogy nem kell előre "túlméretezned" a szervert – pontosan annyiért fizetsz, amennyit használsz, terheléskor pedig magától bővül.');
		}
		benefits.push("🔒 Beépített, folyamatosan frissülő biztonsági védelem (DDoS-védelem, tűzfal-szabályok, javított sérülékenység-kezelés) enterprise-szinten, amit saját szerveren magadnak kellene karbantartanod.");
		benefits.push("📊 Azure Monitor: valós idejű riasztásokat kapsz, ha valami elromlik - mielőtt az ügyfeleid észrevennék.");

		return benefits.slice(0, 3); // max 3 pont, hogy ne legyen túl hosszú
	}

	const qualitativeBenefits = buildQualitativeBenefits();
	const qualitativeBenefitsHtml = `<ul class="verdict-benefits">${qualitativeBenefits.map(b => `<li>${b}</li>`).join('')}</ul>`;

	// ================== ŐSZINTE VERDIKT ==================
	let laborSavingsForVerdict = 0;
	if (hours > 0 && rate > 0) {
		laborSavingsForVerdict = (hours * 0.7) * rate;
	}
	const totalMonthlyBenefit = monthlySavings + laborSavingsForVerdict;
	const relativeSavings = currentCost > 0 ? (totalMonthlyBenefit / currentCost) : 0;

	const verdictBox = document.getElementById('verdict-box');
	const leadHeading = document.getElementById('lead-heading');
	const leadIntro = document.getElementById('lead-intro');

	if (totalMonthlyBenefit > 10 && relativeSavings > 0.10) {
		verdictBox.className = "verdict-box verdict-positive";
		verdictBox.innerHTML = `
			<span class="verdict-title">✅ Egyértelműen megéri váltani</span>
			A számok alapján az Azure-ra váltás mind költségben, mind kényelemben egyértelmű nyereséget jelentene. Ráadásul ezt is kapod hozzá:
			${qualitativeBenefitsHtml}
		`;
		leadHeading.textContent = "Szeretnéd ezt ténylegesen megvalósítani? 🚀";
		leadIntro.textContent = "Kérj egy ingyenes, személyre szabott Azure migrációs felmérést – visszajelzünk 1-2 munkanapon belül.";
	} else if (totalMonthlyBenefit >= -10 && relativeSavings >= -0.05) {
		verdictBox.className = "verdict-box verdict-neutral";
		verdictBox.innerHTML = `
			<span class="verdict-title">🤔 Kb. hasonló a költség – de van más előny</span>
			Tisztán árban nincs nagy különbség a jelenlegi megoldásodhoz képest. De az ár nem minden – cserébe ezt kapnád:
			${qualitativeBenefitsHtml}
		`;
		leadHeading.textContent = "Érdekelne egy pontosabb elemzés? 🤝";
		leadIntro.textContent = "Az árak alapján nincs drámai különbség, de ha a biztonság/megbízhatóság/kényelem érdekel, szívesen átbeszéljük egy ingyenes konzultáción.";
	} else {
		verdictBox.className = "verdict-box verdict-negative";
		verdictBox.innerHTML = `
			<span class="verdict-title">❌ Jelenleg valószínűleg NEM éri meg váltanod – tisztán ár alapján</span>
			Az adataid alapján a jelenlegi megoldásod olcsóbb marad, mint az Azure – ez teljesen jó és normális eredmény lehet, főleg kisebb, stabil terhelésű rendszereknél. Viszont érdemes tudni: a többletköltségért cserébe ezt kapnád:
			${qualitativeBenefitsHtml}
			Ha ezek közül bármelyik fontosabb neked, mint a pár eurós különbség, érdemes lehet mégis megfontolni.
		`;
		leadHeading.textContent = "Mégis szeretnél egy második véleményt? 🧐";
		leadIntro.textContent = "Ha bizonytalan vagy, vagy fontos a biztonság/megbízhatóság, szívesen átnézzük veled ingyenesen, hogy tényleg ez-e a jó döntés.";
	}

	// Elmentjük az összefoglalót a lead-küldéshez
	window._calculatorSummary = {
		hosting, region, cpu, ram, storage, db, bandwidth, users, uptime, hasBackup,
		currentCost, growth, hours, rate,
		azureBaseTotal: azureBaseTotal.toFixed(0),
		azureOptimizedTotal: azureOptimizedTotal.toFixed(0),
		monthlySavings: monthlySavings.toFixed(0)
	};

	document.getElementById('form-card').style.display = 'none';
	document.getElementById('result-card').style.display = 'block';
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restartCalculator() {
	document.getElementById('result-card').style.display = 'none';
	document.getElementById('form-card').style.display = 'block';
	showStep(1);
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================== LEAD KÜLDÉS ==================
async function submitLead(event) {
	event.preventDefault();
	const button = document.getElementById('lead-submit-button');
	const resultBox = document.getElementById('lead-result');

	const lead = {
		name: document.getElementById('lead-name').value,
		email: document.getElementById('lead-email').value,
		company: document.getElementById('lead-company').value,
		phone: document.getElementById('lead-phone').value,
		summary: window._calculatorSummary || {}
	};

	button.disabled = true;
	button.textContent = "Küldés...";
	resultBox.innerHTML = "";

	try {
		const response = await fetch('/api/lead', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(lead)
		});

		if (!response.ok) throw new Error("Szerver hiba");

		resultBox.innerHTML = `<p class="lead-success">Köszönjük! Hamarosan jelentkezünk nálad. ✅</p>`;
		document.getElementById('lead-form').style.display = 'none';
	} catch (err) {
		resultBox.innerHTML = `<p class="lead-error">Hiba történt a küldés során, próbáld újra kicsit később.</p>`;
		button.disabled = false;
		button.textContent = "Kérem az ingyenes felmérést";
	}
}
