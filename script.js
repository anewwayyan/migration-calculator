function toggleTheme() {
	const html = document.documentElement;
	const isDark = html.getAttribute('data-theme') === 'dark';

	if (isDark) {
		html.removeAttribute('data-theme');
		localStorage.setItem('theme', 'light');
	} else {
		html.setAttribute('data-theme', 'dark');
		localStorage.setItem('theme', 'dark');
	}
}
