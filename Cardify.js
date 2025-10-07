// @lampa-desc: Плагин преобразует привычный вид карточек, предлагая обновленный интерфейс — более яркий, красочный и привлекательный

// Cardify (fixed v2) — стабильный бекдроп для экрана full в Lampa (TV + Mobile)
// - Не трогает парсеры, только UI
// - Левый большой постер остаётся скрытым (если он есть в разметке)
// - Работает и когда ядро ставит фон как CSS background, и когда как <img>
// - Если фонового узла нет — создаёт свой .cardify-backdrop
(function () {
  'use strict';

  var SCOPE_CLASS = 'cardify-enabled';
  var BG_CLASS    = 'cardify__background';
  var HIDE_LEFT   = true; // скрывать левую колонку (на мобиле её обычно нет — это безопасно)

  function injectCSS() {
    if (document.getElementById('cardify-fixed-v2-style')) return;

    var css = `
/* ===== Cardify v2 — общий фон ===== */
body.${SCOPE_CLASS} .${BG_CLASS},
body.${SCOPE_CLASS} .cardify-backdrop{
  position:absolute !important;
  top:0; left:0; right:0;
  height:44vh;              /* TV/desktop */
  background-position:center center !important;
  background-repeat:no-repeat !important;
  background-size:cover !important;
  opacity:1 !important;
  z-index:0 !important;
  pointer-events:none !important;
}
@media (max-width:1024px){
  body.${SCOPE_CLASS} .${BG_CLASS},
  body.${SCOPE_CLASS} .cardify-backdrop{ height:38vh; } /* планшет */
}
@media (max-width:600px){
  body.${SCOPE_CLASS} .${BG_CLASS},
  body.${SCOPE_CLASS} .cardify-backdrop{ height:32vh; } /* мобильный */
}

/* затемнение для читаемости текста */
body.${SCOPE_CLASS} .${BG_CLASS}::after,
body.${SCOPE_CLASS} .cardify-backdrop::after{
  content:"";
  position:absolute; inset:0;
  background:
    linear-gradient(to bottom, rgba(0,0,0,.60), rgba(0,0,0,.15) 40%, rgba(0,0,0,0) 75%),
    linear-gradient(to right, rgba(0,0,0,.35), rgba(0,0,0,0) 45%);
}

/* корневые контейнеры поверх фона */
body.${SCOPE_CLASS} .full-start,
body.${SCOPE_CLASS} .full-start-new,
body.${SCOPE_CLASS} [data-name="full"],
body.${SCOPE_CLASS} .full{
  position:relative;
  z-index:1;
}

/* сделать прозрачными типовые контейнеры фона, если они есть */
body.${SCOPE_CLASS} .full-start__background,
body.${SCOPE_CLASS} .full-start-new__background,
body.${SCOPE_CLASS} .full .background{
  background-color:transparent !important;
}

/* скрыть левую колонку-постер */
${HIDE_LEFT ? `
body.${SCOPE_CLASS} .full-start__left,
body.${SCOPE_CLASS} .full-start-new__left{
  display:none !important;
}` : ''}

`;
    var style = document.createElement('style');
    style.id = 'cardify-fixed-v2-style';
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function findFullRoot() {
    return (
      document.querySelector('.full-start') ||
      document.querySelector('.full-start-new') ||
      document.querySelector('.full') ||
      document.querySelector('[data-name="full"]')
    );
  }

  // любой потенциальный бг-узел
  function findBackdropNode(root) {
    if (!root) root = document;
    return (
      root.querySelector('.full-start__background') ||
      root.querySelector('.full-start-new__background') ||
      root.querySelector('.full .background') ||
      // широкий поиск по классам
      root.querySelector('[class*="background"], [class*="backdrop"]')
    );
  }

  // достаём URL фона: сначала из CSS, иначе из <img> / srcset
  function extractBackdropURL(node) {
    if (!node) return null;
    try {
      var cs = getComputedStyle(node);
      if (cs && cs.backgroundImage && cs.backgroundImage !== 'none') {
        // background-image: url("..."), вытащим URL
        var match = cs.backgroundImage.match(/url\\((["']?)(.*?)\\1\\)/);
        if (match && match[2]) return match[2];
      }
    } catch(e){}

    // попробуем <img>
    var img = node.querySelector('img[src], img[srcset]');
    if (img) {
      if (img.currentSrc) return img.currentSrc;
      if (img.srcset) {
        // берём самый правый srcset (обычно самый большой)
        var parts = img.srcset.split(',').map(s => s.trim());
        var last = parts[parts.length - 1];
        var url = last && last.split(' ')[0];
        if (url) return url;
      }
      if (img.src) return img.src;
    }

    return null;
  }

  // убедиться, что у конкретного узла есть CSS background-image
  function ensureBackgroundImage(bg) {
    try {
      var cs = getComputedStyle(bg);
      var hasBg = cs && cs.backgroundImage && cs.backgroundImage !== 'none';
      if (!hasBg) {
        var url = extractBackdropURL(bg);
        if (!url) {
          // поищем <img> глубже
          var deepImg = (bg.closest('.full-start, .full-start-new, .full') || document)
                        .querySelector('img[class*="backdrop"], img[class*="background"], img[srcset], img[src]');
          if (deepImg) url = deepImg.currentSrc || deepImg.src || null;
        }
        if (url) {
          bg.style.backgroundImage = 'url("' + url + '")';
        }
      }
    } catch (e) {}
  }

  // если бекдроп-узла нет — создаём свой
  function ensureOwnBackdrop(fullRoot) {
    var own = fullRoot.querySelector('.cardify-backdrop');
    if (!own) {
      own = document.createElement('div');
      own.className = 'cardify-backdrop';
      // вставим первым ребёнком, чтобы быть «под» контентом
      fullRoot.insertBefore(own, fullRoot.firstChild);
    }
    // попытаемся добыть URL из любого известного узла, если есть
    var donor = findBackdropNode(fullRoot);
    var url = extractBackdropURL(donor) || extractBackdropURL(fullRoot) || null;
    if (url) own.style.backgroundImage = 'url("' + url + '")';
    return own;
  }

  function activateBackdrop() {
    var full = findFullRoot();
    if (!full) return false;

    document.body.classList.add(SCOPE_CLASS);

    // 1) если есть «родной» фон — используем его
    var bg = findBackdropNode(full);
    if (bg) {
      if (!bg.classList.contains(BG_CLASS)) bg.classList.add(BG_CLASS);
      ensureBackgroundImage(bg);
      bg.classList.add('loaded'); // на случай, если стили это учитывают
      return true;
    }

    // 2) иначе — создаём свой фоновый слой
    var own = ensureOwnBackdrop(full);
    own.classList.add('loaded');
    return true;
  }

  function hideLeftPosterSafe() {
    if (!HIDE_LEFT) return;
    var full = findFullRoot();
    if (!full) return;
    var left = full.querySelector('.full-start__left, .full-start-new__left');
    if (left) left.style.setProperty('display','none','important');
  }

  function armObservers() {
    // Ловим появление/пересборку экрана full (актуально и для мобилки)
    var mo = new MutationObserver(function() {
      var full = findFullRoot();
      if (!full) return;
      activateBackdrop();
      hideLeftPosterSafe();

      // Доп. наблюдатель за изменениями внутри самого экрана: фон/картинка могли подгрузиться позже
      var inner = new MutationObserver(function() {
        activateBackdrop();
      });
      inner.observe(full, { childList: true, subtree: true });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    injectCSS();
    // пробуем сразу (вдруг full уже в DOM)
    activateBackdrop();
    hideLeftPosterSafe();
    // и на будущее
    armObservers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();