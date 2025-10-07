// @lampa-desc: Плагин преобразует привычный вид карточек, предлагая обновленный интерфейс — более яркий, красочный и привлекательный

// Cardify.fix.v3 — мобилка с постером, TV c большой обложкой
// - Mobile: возвращаем постер (снимаем .hide, показываем левую колонку)
// - TV: прячем постер и стабильно включаем бекдроп (если нужно, создаём свой слой)
// - Не трогаем парсеры/источники, только UI.

(function () {
  'use strict';

  var SCOPE = 'cardify-v3';
  var BODY  = document.body;

  // --------- Определение платформы (TV vs Mobile) ----------
  function isTV() {
    try {
      if (window.Lampa && Lampa.Platform) {
        if (typeof Lampa.Platform.tv === 'function') return !!Lampa.Platform.tv();
        if (typeof Lampa.Platform.is === 'function') return !!Lampa.Platform.is('tv');
        if (typeof Lampa.Platform.source === 'string') return Lampa.Platform.source === 'tv';
      }
    } catch (e) {}
    // подстраховка по userAgent для Android TV / Smart TV
    return /(smart[- ]?tv|hbbtv|tizen|webos|bravia|aftt|aftm|aftb|shield|mibox|hisense|\btv\b)/i.test(navigator.userAgent);
  }

  // --------- Вспомогалки DOM ----------
  function q(sel, root){ return (root||document).querySelector(sel); }
  function qa(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

  function fullRoot(){
    return q('.full-start') || q('.full-start-new') || q('.full') || q('[data-name="full"]');
  }

  function findBackdropNode(root){
    root = root || fullRoot() || document;
    return q('.full-start__background', root)
        || q('.full-start-new__background', root)
        || q('.full .background', root)
        || q('[class*="background"], [class*="backdrop"]', root)
        || null;
  }

  // достаём url фона откуда угодно: CSS background-image, <img>, srcset
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
        var parts = img.srcset.split(',').map(function(s){return s.trim();});
        var last = parts[parts.length-1];
        var url  = last && last.split(' ')[0];
        if (url) return url;
      }
      if (img.src) return img.src;
    }
    return null;
  }

  // --------- CSS (вешаем только один раз) ----------
  function injectCSS(){
    if (q('#'+SCOPE+'-style')) return;
    var css = `
/* Скоупим всё под body.cardify-v3 */
body.${SCOPE}{}

/* === TV режим: большая "шапка"-обложка, постер скрыт === */
body.${SCOPE}.mode-tv .cardify__background,
body.${SCOPE}.mode-tv .cardify-backdrop{
  position:absolute !important;
  top:0; left:0; right:0;
  height:44vh;                 /* можно подправить */
  background-position:center center !important;
  background-repeat:no-repeat !important;
  background-size:cover !important;
  opacity:1 !important;
  z-index:0 !important;
  pointer-events:none !important;
}
@media (max-width:1280px){
  body.${SCOPE}.mode-tv .cardify__background,
  body.${SCOPE}.mode-tv .cardify-backdrop{ height:40vh; }
}
body.${SCOPE}.mode-tv .cardify__background::after,
body.${SCOPE}.mode-tv .cardify-backdrop::after{
  content:"";
  position:absolute; inset:0;
  background:
    linear-gradient(to bottom, rgba(0,0,0,.60), rgba(0,0,0,.15) 40%, rgba(0,0,0,0) 75%),
    linear-gradient(to right, rgba(0,0,0,.35), rgba(0,0,0,0) 45%);
}

/* корневой full поверх фона */
body.${SCOPE}.mode-tv .full-start,
body.${SCOPE}.mode-tv .full-start-new,
body.${SCOPE}.mode-tv [data-name="full"],
body.${SCOPE}.mode-tv .full{
  position:relative; z-index:1;
}

/* скрываем левый постер только на TV */
body.${SCOPE}.mode-tv .full-start__left,
body.${SCOPE}.mode-tv .full-start-new__left{
  display:none !important;
}

/* делаем прозрачными любые родные фон-контейнеры */
body.${SCOPE}.mode-tv .full-start__background,
body.${SCOPE}.mode-tv .full-start-new__background,
body.${SCOPE}.mode-tv .full .background{
  background-color:transparent !important;
}

/* === Mobile режим: постер обязан быть видим === */
body.${SCOPE}.mode-mobile .full-start__left,
body.${SCOPE}.mode-mobile .full-start-new__left{
  display:block !important;
}
body.${SCOPE}.mode-mobile .full-start-new__left.hide,
body.${SCOPE}.mode-mobile .full-start__left.hide{
  display:block !important;
}
body.${SCOPE}.mode-mobile .full-start-new__poster,
body.${SCOPE}.mode-mobile .full-start__poster{
  opacity:1 !important;
  visibility:visible !important;
}
`;
    var st = document.createElement('style');
    st.id = SCOPE+'-style';
    st.type = 'text/css';
    st.appendChild(document.createTextNode(css));
    document.head.appendChild(st);
  }

  // --------- TV: включаем бекдроп, если нужно — создаём свой слой ----------
  function ensureBackgroundImage(bg){
    try {
      var cs = getComputedStyle(bg);
      var has = cs && cs.backgroundImage && cs.backgroundImage !== 'none';
      if (!has){
        var url = extractURL(bg) || extractURL(bg.closest('.full-start, .full-start-new, .full')) || null;
        if (url) bg.style.backgroundImage = 'url("'+url+'")';
      }
    } catch(e){}
  }

  function ensureOwnBackdrop(root){
    var host = root || fullRoot();
    if (!host) return null;
    var layer = q('.cardify-backdrop', host);
    if (!layer){
      layer = document.createElement('div');
      layer.className = 'cardify-backdrop';
      host.insertBefore(layer, host.firstChild);
    }
    // наполняем из любого донорского узла
    var donor = findBackdropNode(host) || host;
    var url   = extractURL(donor);
    if (url) layer.style.backgroundImage = 'url("'+url+'")';
    return layer;
  }

  function activateTV(){
    BODY.classList.add(SCOPE, 'mode-tv');
    BODY.classList.remove('mode-mobile');

    var root = fullRoot();
    if (!root) return;

    // Прячем левую колонку (если есть)
    var left = q('.full-start__left, .full-start-new__left', root);
    if (left) left.style.setProperty('display','none','important');

    // Стабильный фон: используем родной узел, иначе создаём свой
    var bg = findBackdropNode(root);
    if (bg){
      bg.classList.add('cardify__background','loaded');
      ensureBackgroundImage(bg);
    } else {
      ensureOwnBackdrop(root);
    }
  }

  // --------- Mobile: возвращаем постер и не трогаем фон ----------
  function activateMobile(){
    BODY.classList.add(SCOPE, 'mode-mobile');
    BODY.classList.remove('mode-tv');

    var root = fullRoot();
    if (!root) return;

    // Показать левую колонку и снять .hide (в исходном шаблоне он часто стоит)
    qa('.full-start__left, .full-start-new__left', root).forEach(function(el){
      el.classList.remove('hide');
      el.style.setProperty('display','block','important');
    });

    // На всякий: показать сам постер
    qa('.full-start__poster, .full-start-new__poster', root).forEach(function(el){
      el.style.setProperty('opacity','1','important');
      el.style.setProperty('visibility','visible','important');
    });
  }

  // --------- Наблюдатели: экран "full" может пересобираться ----------
  function observe(){
    var bootedForThisScreen = null;

    var mo = new MutationObserver(function(){
      var root = fullRoot();
      if (!root) { bootedForThisScreen = null; return; }

      // чтобы не дёргать лишний раз — отмечаем, что уже применяли к этому корню
      if (bootedForThisScreen === root) return;
      bootedForThisScreen = root;

      if (isTV()) {
        activateTV();
        // внутри экрана следим за подгрузкой картинок, чтобы добить бекдроп
        var inner = new MutationObserver(function(){
          activateTV();
        });
        inner.observe(root, { childList:true, subtree:true });
      } else {
        activateMobile();
        // если мобильный пересобрал DOM — вернём постер снова
        var innerM = new MutationObserver(function(){
          activateMobile();
        });
        innerM.observe(root, { childList:true, subtree:true });
      }
    });

    mo.observe(document.body, { childList:true, subtree:true });
  }

  // --------- Инициализация ----------
  function init(){
    injectCSS();

    // Первый прогон
    if (isTV()) activateTV(); else activateMobile();

    // Наблюдать за дальнейшими заменами экрана
    observe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();