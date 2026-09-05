function toggleTheme() {
	const html = document.documentElement;
	const btn = document.querySelector('.theme-toggle');
	const isDark = html.getAttribute('data-theme') === 'dark';

	if (isDark) {
		html.removeAttribute('data-theme');
		if (btn) btn.textContent = '🌙 Sötét mód';
		localStorage.setItem('theme', 'light');
	} else {
		html.setAttribute('data-theme', 'dark');
		if (btn) btn.textContent = '☀️ Világos mód';
		localStorage.setItem('theme', 'dark');
	}
}

function applyStoredTheme() {
	const savedTheme = localStorage.getItem('theme');
	const btn = document.querySelector('.theme-toggle');
	if (savedTheme === 'dark' && btn) {
		btn.textContent = '☀️ Világos mód';
	}
}
applyStoredTheme();
