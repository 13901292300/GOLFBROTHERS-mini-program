(function (global) {
    var KEY = 'gb-theme';

    function normalize(theme) {
        return theme === 'dark' ? 'dark' : 'bright';
    }

    function getGlobalTheme() {
        try { return normalize(global.localStorage.getItem(KEY)); }
        catch (e) { return 'bright'; }
    }

    function isGlobalBrightMode() {
        return getGlobalTheme() === 'bright';
    }

    function updateThemeIcons(doc, dark) {
        var bright = !dark;
        var mainIcon = doc.getElementById('theme-icon') || doc.getElementById('themeIcon');
        if (mainIcon) {
            mainIcon.className = (dark ? 'fas fa-sun' : 'fas fa-moon') + (mainIcon.classList.contains('text-sm') || mainIcon.id === 'theme-icon' ? ' text-sm' : '');
        }
        doc.querySelectorAll('.theme-btn i').forEach(function (icon) {
            if (icon.id === 'theme-icon' || icon.id === 'themeIcon') return;
            icon.classList.toggle('fa-sun', dark);
            icon.classList.toggle('fa-moon', bright);
        });
    }

    function applyThemeToDocument(doc, theme) {
        if (!doc || !doc.body) return;
        var dark = theme === 'dark';
        var bright = !dark;
        doc.body.classList.toggle('dark-theme', dark);
        doc.body.classList.toggle('bright-mode', bright);
        doc.body.classList.toggle('bright', bright);
        updateThemeIcons(doc, dark);
    }

    function syncEmbeddedViews(isBright) {
        var page = document.getElementById('group-manage-page');
        if (page) {
            page.classList.toggle('bright-mode', !!isBright);
            page.classList.toggle('bright', !!isBright);
        }
        var frame = document.getElementById('group-manage-frame');
        if (!frame) return;
        try {
            var win = frame.contentWindow;
            var doc = frame.contentDocument || (win && win.document);
            if (win && typeof win.setAddDeleteTheme === 'function') {
                win.setAddDeleteTheme(!!isBright);
            }
            if (doc && doc.body) {
                applyThemeToDocument(doc, isBright ? 'bright' : 'dark');
            }
        } catch (e) {}
    }

    function setGlobalTheme(theme) {
        theme = normalize(theme);
        try { global.localStorage.setItem(KEY, theme); } catch (e) {}
        applyThemeToDocument(document, theme);
        syncEmbeddedViews(theme === 'bright');
        global.dispatchEvent(new CustomEvent('gb-theme-change', { detail: { theme: theme } }));
    }

    function toggleTheme() {
        setGlobalTheme(isGlobalBrightMode() ? 'dark' : 'bright');
    }

    function initGlobalTheme() {
        applyThemeToDocument(document, getGlobalTheme());
        syncEmbeddedViews(isGlobalBrightMode());
    }

    global.getGlobalTheme = getGlobalTheme;
    global.isGlobalBrightMode = isGlobalBrightMode;
    global.setGlobalTheme = setGlobalTheme;
    global.syncGlobalTheme = function (isBright) { setGlobalTheme(isBright ? 'bright' : 'dark'); };
    global.syncEmbeddedViews = syncEmbeddedViews;
    global.toggleTheme = toggleTheme;
    global.setAddDeleteTheme = function (isBright) { setGlobalTheme(isBright ? 'bright' : 'dark'); };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGlobalTheme);
    } else {
        initGlobalTheme();
    }
})(window);
