// @lampa-desc: Плагин преобразует привычный вид карточек, предлагая обновленный интерфейс — более яркий, красочный и привлекательный

(function () {
  'use strict';

  // --- настройка (при желании меняй) ---
  var SCOPE_CLASS = 'cardify-enabled';        // класс на <body> для скоупа CSS
  var BG_CLASS    = 'cardify__background';     // класс на реальном бг-узле
  var HIDE_LEFT   = true;                      // прятать левый большой постер
  // --------------------------------------

  // Подстраховка: если есть Lampa.Platform.tv — активируем ТВ-режим (не критично)
  try { if (window.Lampa && Lampa.Platform && typeof Lampa.Platform.tv === 'function') Lampa.Platform.tv(); } catch(e){}

  // Втыкаем CSS один раз
  function injectCSS() {
    if (document.getElementById('cardify-fixed-style')) return;

    var css = `
/* === Cardify (fixed) — CSS скоуп === */
body.${SCOPE_CLASS} .${BG_CLASS}{
  position: absolute !important;
  inset: 0 !important;
  background-position: center center !important;
  background-repeat: no-repeat !important;
  background-size: cover !important;
  opacity: 1 !important;
  z-index: 0 !important;
}

/* мягкое затемнение сверху и слева, чтобы текст читался */
body.${SCOPE_CLASS} .${BG_CLASS}::after{
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* верхний градиент + боковые легкие градиенты */
  background:
    linear-gradient(to bottom, rgba(0,0,0,.60), rgba(0,0,0,.20) 35%, rgba(0,0,0,0) 70%),
    linear-gradient(to right, rgba(0,0,0,.35), rgba(0,0,0,0) 45%);
}

/* корневая обертка контента поверх фона */
body.${SCOPE_CLASS} .full-start, 
body.${SCOPE_CLASS} .full-start-new,
body.${SCOPE_CLASS} [data-name="full"]{
  position: relative;
  z-index: 1;
}

/* прячем левый большой постер, но не ломаем сетку */
${HIDE_LEFT ? `
body.${SCOPE_CLASS} .full-start__left,
body.${SCOPE_CLASS} .full-start-new__left{
  display: none !important;
}
` : ''}

/* частая проблема: фон бывает под контейнером — убираем сплошные фоны у оберток */
body.${SCOPE_CLASS} .full-start__background,
body.${SCOPE_CLASS} .full-start-new__background,
body.${SCOPE_CLASS} .full .background{
  background-color: transparent !important;
}

/* если ядро ставит .dim/.loaded — не мешаем; если нет — мы и так принудили видимость */
`;

    var style = document.createElement('style');
    style.id = 'cardify-fixed-style';
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // Находим корень экрана "full" (карточка)
  function findFullRoot() {
    return (
      document.querySelector('.full-start') ||
      document.querySelector('.full-start-new') ||
      document.querySelector('[data-name="full"]')
    );
  }

  // Находим реальный узел фона (в разных версиях он назывался по-разному)
  function findBackdropNode(root) {
    if (!root) root = document;
    return (
      root.querySelector('.full-start__background') ||
      root.querySelector('.full-start-new__background') ||
      // иногда ядро кладет просто .background внутри full
      root.querySelector('.full .background, .background') ||
      null
    );
  }

  // Поднять <img src> в background-image, если фон не задан стилем
  function ensureBackgroundImage(bg) {
    try {
      var cs = getComputedStyle(bg);
      var hasBg = cs && cs.backgroundImage && cs.backgroundImage !== 'none';
      if (!hasBg) {
        var img = bg.querySelector('img[src]');
        if (img && img.src) {
          // иногда src может быть временно пустым — проверяем длину
          bg.style.backgroundImage = 'url("' + img.src + '")';
        }
      }
    } catch (e) {}
  }

  // Основной хук: включить «шапку»
  function activateBackdrop() {
    var full = findFullRoot();
    if (!full) return false;

    document.body.classList.add(SCOPE_CLASS);
    var bg = findBackdropNode(full);
    if (!bg) return false;

    // даём наш класс и приводим к ожидаемому виду
    if (!bg.classList.contains(BG_CLASS)) bg.classList.add(BG_CLASS);

    // если фон не проставлен ядром — поднимем картинку из <img>
    ensureBackgroundImage(bg);

    // Иногда ядро навешивает .loaded/.dim — мы не требуем их, но добавим loaded для совместимости
    bg.classList.add('loaded');

    return true;
  }

  // Прячем левую колонку (если вдруг разметка другая)
  function hideLeftPosterSafe() {
    if (!HIDE_LEFT) return;
    var full = findFullRoot();
    if (!full) return;

    var left = full.querySelector('.full-start__left, .full-start-new__left');
    if (left) left.style.setProperty('display','none','important');
  }

  // Реакция на появление/пересборку экрана
  function armObservers() {
    // 1) M.O. на тело документа — ловим появление экрана full
    var mo = new MutationObserver(function() {
      var full = findFullRoot();
      if (!full) return;

      // как только экран есть — пробуем активировать
      var ok = activateBackdrop();
      hideLeftPosterSafe();

      // 2) Доп. наблюдатель за самим экраном — вдруг фон подгрузится позже
      if (ok) {
        var bgMo = new MutationObserver(function() {
          activateBackdrop();
        });
        bgMo.observe(full, { childList: true, subtree: true });
      }
    });

    mo.observe(document.body, { childList: true, subtree: true });
  }

  // Инициализация — без зависимости от внутренних событий Lampa
  function init() {
    try { injectCSS(); } catch(e){}
    // Попытка сразу (на случай, если full уже в DOM)
    activateBackdrop();
    hideLeftPosterSafe();
    // Наблюдатели на будущее
    armObservers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();