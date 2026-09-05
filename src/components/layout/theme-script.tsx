/** Applies the saved theme before first paint, avoiding a flash of light UI. */
export function ThemeScript() {
  const script = `
    try {
      var saved = localStorage.getItem('nojads-theme');
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (saved === 'dark' || (!saved && prefersDark)) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
