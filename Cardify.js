// @lampa-desc: Плагин преобразует привычный вид карточек, предлагая обновленный интерфейс

(function () {
  'use strict';

  /* ===== Настройки ===== */
  var SCOPE_CLASS = 'cardify-tv-fix';
  var BACKDROP_HEIGHT_VH = 44; // высота "шапки" в vh; подстрой, если нужно

  function isTV() {
    try {
      if (window.Lampa && Lampa.Platform){
        if (typeof Lampa.Platform.is === 'function') return !!Lampa.Platform.is('tv');
        if (typeof Lampa.Platform.get === 'function') return !!Lampa.Platform.get('tv');
        // старые сборки:
        if (typeof Lampa.Platform.source === 'string') return Lampa.Platform.source === 'tv';
      }
    } catch(e){}
    return false;
  }

  function injectCSS(){
    if (document.getElementById('cardify-tv-fix-style')) return;
    var css = `
/* ===== Cardify TV Backdrop (скоуп по body) ===== */
body.${SCOPE_CLASS} .cardify__backdrop{
  position:absolute;
  top:0; left:0; right:0;
  height:${BACKDROP_HEIGHT_VH}vh;
  z-index:-1;                 /* главное — позади контента */
  pointer-events:none;
  background-position:center center;
  background-repeat:no-repeat;
  background-size:cover;
  /* накладываем лёгкий градиент В ФОНЕ (не сверху контента) */
  background-image: var(--cardify-backdrop-image, none);
}

/* корневой экран — создаём стек и не задаём z-index, чтобы -1 был позади детей */
body.${SCOPE_CLASS} .full-start,
body.${SCOPE_CLASS} .full-start-new,
body.${SCOPE_CLASS} [data-name="full"],
body.${SCOPE_CLASS} .full{
  position:relative;
}

/* скрыть левый постер ТОЛЬКО на TV */
body.${SCOPE_CLASS} .full-start__left,
body.${SCOPE_CLASS} .full-start-new__left{
  display:none !important;
}

/* любые штатные фоновые контейнеры делаем прозрачными, но не трогаем их image */
body.${SCOPE_CLASS} .full-start__background,
body.${SCOPE_CLASS} .full-start-new__background,
body.${SCOPE_CLASS} .full .background{
  background-color:transparent !important;
}

/* адаптив по высоте "шапки" (если нужно) */
@media (max-width:1280px){
  body.${SCOPE_CLASS} .cardify__backdrop{ height:${Math.round(BACKDROP_HEIGHT_VH*0.9)}vh; }
}
`;
    var st = document.createElement('style');
    st.id = 'cardify-tv-fix-style';
    st.type = 'text/css';
    st.appendChild(document.createTextNode(css));
    document.head.appendChild(st);
  }

  function q(sel, root){ return (root||document).querySelector(sel); }
  function qa(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

  function getFullRoot(){
    return q('.full-start') || q('.full-start-new') || q('.full') || q('[data-name="full"]');
  }

  // Пытаемся найти "родной" фон
  function findNativeBackground(root){
    root = root || getFullRoot() || document;
    return q('.full-start-new__background', root)
        || q('.full-start__background', root)
        || q('.full .background', root)
        || q('[class*="background"], [class*="backdrop"]', root)
        || null;
  }

  // Достаём URL картинки: сначала CSS background-image, затем <img>/srcset
  function extractURL(node){
    if (!node) return null;
    try {
      var cs = getComputedStyle(node);
      if (cs && cs.backgroundImage && cs.backgroundImage !== 'none'){
        var m = cs.backgroundImage.match(/url\((["']?)(.*?)\1\)/);
        if (m && m[2]) return m[2];
      }
    } catch(e){}
    var img = node.querySelector('img[src], img[srcset]');
    if (img){
      if (img.currentSrc) return img.currentSrc;
      if (img.srcset){
        var last = img.srcset.split(',').map(s=>s.trim()).pop();
        var url = last && last.split(' ')[0];
        if (url) return url;
      }
      if (img.src) return img.src;
    }
    return null;
  }

  // Создаём/возвращаем наш слой, всегда один на экран
  function ensureBackdropLayer(root){
    var host = root || getFullRoot();
    if (!host) return null;
    var layer = q(':scope > .cardify__backdrop', host);
    if (!layer){
      layer = document.createElement('div');
      layer.className = 'cardify__backdrop';
      host.insertBefore(layer, host.firstChild); // за контентом (z:-1), но в том же стеке
    }
    return layer;
  }

  // Сформировать background-image для нашего слоя: градиент + картинка
  function composeBg(url){
    // лёгкий «читабельный» градиент в самом фоне, не поверх контента
    var grad = 'linear-gradient(to bottom, rgba(0,0,0,.55), rgba(0,0,0,.15) 42%, rgba(0,0,0,0) 80%)';
    return 'url("'+url+'"), '+grad; // картинка снизу, градиент сверху ВНУТРИ слоя
  }

  function activateTVBackdrop(){
    document.body.classList.add(SCOPE_CLASS);

    var root = getFullRoot();
    if (!root) return;

    // скрыть левый постер (если есть)
    var left = q('.full-start__left, .full-start-new__left', root);
    if (left) left.style.setProperty('display','none','important');

    // находим источник фона
    var native = findNativeBackground(root);
    var url = extractURL(native);
    if (!url){
      // последний шанс: любой <img> наверху экрана
      var anyImg = q('img[class*="backdrop"], img[class*="background"], .full img, .full-start img, .full-start-new img', root);
      if (anyImg) url = anyImg.currentSrc || anyImg.src || null;
    }
    if (!url) return; // нема — не рисуем слой

    // создаём слой и ставим фон
    var layer = ensureBackdropLayer(root);
    if (!layer) return;

    // ВАЖНО: ставим через CSS-переменную, чтобы не затирать правило стилей
    layer.style.setProperty('--cardify-backdrop-image', composeBg(url));
  }

  function observeFullScreen(){
    var lastRoot = null;

    // следим за появлением экрана full
    var mo = new MutationObserver(function(){
      var root = getFullRoot();
      if (!root) { lastRoot = null; return; }
      if (root === lastRoot) return;
      lastRoot = root;

      activateTVBackdrop();

      // наблюдаем и внутри — вдруг позже подгрузится нужная картинка
      var inner = new MutationObserver(function(){ activateTVBackdrop(); });
      inner.observe(root, { childList:true, subtree:true });
    });

    mo.observe(document.body, { childList:true, subtree:true });
  }

  function init(){
    if (!isTV()) return;            // только TV
    injectCSS();
    // первый прогон (если экран уже в DOM)
    activateTVBackdrop();
    // и наблюдатели на пересборки
    observeFullScreen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();

