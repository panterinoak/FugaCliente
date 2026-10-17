// Aplica el tema guardado antes del primer pintado para evitar parpadeos.
(function applyStoredTheme() {
  try {
    var stored = localStorage.getItem('fc_theme');
    if (stored === 'dark' || stored === 'light') document.documentElement.setAttribute('data-theme', stored);
  } catch (e) { /* almacenamiento no disponible: se usa la preferencia del sistema */ }
})();
