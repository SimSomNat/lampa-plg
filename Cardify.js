// @lampa-desc: Плагин преобразует привычный вид карточек, предлагая обновленный интерфейс

(function () {
  'use strict';

  function isTV() {
    try {
      if (window.Lampa && Lampa.Platform) {
        if (typeof Lampa.Platform.get === 'function') return !!Lampa.Platform.get('tv');
        if (typeof Lampa.Platform.is === 'function')  return !!Lampa.Platform.is('tv');
      }
    } catch (e) {}
    return false;
  }

  function injectCSS() {
    if (document.getElementById('cardify-fixed-style')) return;
    var css = `
/* === Cardify fixed (TV only) === */

/* Слой фона: ничего не перезаписываем шортом background! */
.cardify__background{
  position:absolute; inset:0;
  background-position:center center;
  background-repeat:no-repeat;
  background-size:cover;
  z-index:0;
  opacity:1;
  pointer-events:none;
}

/* Градиент СВЕРХУ картинки — отдельным псевдоэлементом, чтобы не убивать image */
body:not(.menu--open) .cardify__background::after{
  content:""; position:absolute; inset:0; pointer-events:none;
  background:
    linear-gradient(to bottom, rgba(0,0,0,.60), rgba(0,0,0,.15) 40%, rgba(0,0,0,0) 75%),
    linear-gradient(to right, rgba(0,0,0,.35), rgba(0,0,0,0) 45%);
}

/* Контентная область поверх фона */
.full-start, .full-start-new, [data-name="full"], .full{ position:relative; z-index:1; }

/* На TV прячем левый постер */
.full-start__left, .full-start-new__left{ display:none !important; }

/* На всякий случай — встроенные фоновые контейнеры делаем прозрачными, но не трогаем их image */
.full-start__background, .full-start-new__background, .full .background{
  background-color:transparent !important;
}
`;
    var st = document.createElement('style');
    st.id = 'cardify-fixed-style';
    st.type = 'text/css';
    st.appendChild(document.createTextNode(css));
    document.head.appendChild(st);
  }

  // ищем корень экрана карточки
  function getFullRoot() {
    return document.querySelector('.full-start, .full-start-new, .full, [data-name="full"]');
  }

  // ищем «родной» фон в любых разметках
  function findNativeBackdrop(root) {
    root = root || getFullRoot() || document;
    return root.querySelector(
      '.full-start-new__background, .full-start__background, .full .background, [class*="background"], [class*="backdrop"]'
    );
  }

  // если фона нет — создаём свой слой
  function ensureOwnBackdrop(root) {
    var host = root || getFullRoot();
    if (!host) return null;
    var layer = host.querySelector('.cardify__background');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'cardify__background';
      host.insertBefore(layer, host.firstChild);
    }
    // Попробуем взять src из любой картинки-бекдропа внутри экрана
    var donorImg = host.querySelector(
      '.full-start-new__background img, .full-start__background img, .full .background img, img[class*="backdrop"], img[srcset], img[src]'
    );
    var url = donorImg ? (donorImg.currentSrc || donorImg.src) : '';
    if (url && !layer.style.backgroundImage) layer.style.backgroundImage = 'url("' + url + '")';
    return layer;
  }

  function activateBackdrop(screenObj) {
    // screenObj.search() — это jQuery-обертка контейнера экрана
    var $root = screenObj && typeof screenObj.search === 'function' ? screenObj.search() : null;
    var rootEl = $root && $root.length ? $root.get(0) : getFullRoot();

    // 1) Пытаемся использовать «родной» фон
    var native = null;
    if ($root && $root.length) {
      native = $root.find('.full-start-new__background, .full-start__background, .full .background').get(0);
      if (!native) native = $root.find('[class*="background"], [class*="backdrop"]').get(0);
    }
    if (!native) native = findNativeBackdrop(rootEl);

    if (native) {
      native.classList.add('cardify__background'); // стили и градиенты применятся
      return;
    }

    // 2) Фаллбэк: создаём собственный слой и тянем картинку
    ensureOwnBackdrop(rootEl);
  }

  function init() {
    // мягко предупредим, но не блокируем (раньше тут было "Ошибка доступа" и return)
    try {
      if (Lampa.Manifest && Lampa.Manifest.origin && Lampa.Manifest.origin !== 'bylampa') {
        if (Lampa.Noty && typeof Lampa.Noty.show === 'function') {
          Lampa.Noty.show('Cardify: неофициальная сборка — работаю в щадящем режиме');
        }
      }
    } catch (e) {}

    if (!isTV()) return;      // только TV
    injectCSS();

    // хук на экран карточки
    Lampa.Listener.follow('full', function (evt) {
      if (evt && evt.type === 'complite') {
        activateBackdrop(evt.object);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
