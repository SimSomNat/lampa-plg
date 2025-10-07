// @lampa-desc: Плагин преобразует привычный вид карточек, предлагая обновленный интерфейс

// cardify.tv.backdrop.safe.js
// TV-фикс для обложки в Lampa:
// - ТОЛЬКО TV (мобилку не трогаем)
// - Прячет все варианты постера на экране full
// - Чинит бекдроп: снимает вредный background:, ставит background-image из нативного источника
// - Никаких перекрытий контента

(function(){
  'use strict';

  /* ======== Определение TV ======== */
  function isTV(){
    try{
      if (window.Lampa && Lampa.Platform){
        if (typeof Lampa.Platform.is === 'function') return !!Lampa.Platform.is('tv');
        if (typeof Lampa.Platform.get === 'function') return !!Lampa.Platform.get('tv');
      }
    }catch(e){}
    const b = document.body;
    if (b){
      if (b.classList.contains('platform--tv') || b.classList.contains('platform-tv') || b.classList.contains('platform_tv')) return true;
    }
    // подстраховка по UA
    return /(smart[- ]?tv|hbbtv|tizen|webos|bravia|aft[bmt]|shield|mibox|hisense|\bTV\b)/i.test(navigator.userAgent);
  }

  /* ======== Утилиты ======== */
  const $ = (s, r)=> (r||document).querySelector(s);
  const $$ = (s, r)=> Array.from((r||document).querySelectorAll(s));

  function getFullRoot(){
    return $('.full-start') || $('.full-start-new') || $('.full') || $('[data-name="full"]');
  }

  function findNativeBg(root){
    root = root || getFullRoot() || document;
    return $('.full-start-new__background', root)
        || $('.full-start__background', root)
        || $('.full .background', root)
        || $('[class*="background"], [class*="backdrop"]', root)
        || null;
  }

  function pickURLFrom(node){
    if (!node) return null;
    try{
      const cs = getComputedStyle(node);
      if (cs && cs.backgroundImage && cs.backgroundImage !== 'none'){
        const m = cs.backgroundImage.match(/url\((["']?)(.*?)\1\)/);
        if (m && m[2]) return m[2];
      }
    }catch(e){}
    const img = node.querySelector('img[src], img[srcset]');
    if (img){
      if (img.currentSrc) return img.currentSrc;
      if (img.srcset){
        const last = img.srcset.split(',').map(s=>s.trim()).pop();
        const url  = last && last.split(' ')[0];
        if (url) return url;
      }
      if (img.src) return img.src;
    }
    return null;
  }

  /* ======== Основной фикс на TV ======== */
  function applyTVFix(root){
    if (!root) return;

    // 1) Прячем любые варианты постера (левую колонку и сами <img>)
    $$('.full-start__left, .full-start-new__left', root).forEach(el=>{
      el.style.setProperty('display','none','important');
    });
    $$('.full-start__poster, .full-start-new__poster, .full--poster, img[class*="poster"]', root).forEach(img=>{
      img.style.setProperty('display','none','important');
      img.style.setProperty('visibility','hidden','important');
      img.style.setProperty('opacity','0','important');
    });

    // 2) Чиним фон
    const bg = findNativeBg(root);
    if (!bg) return;

    // Убиваем только шорт-свойство background, чтобы не затирался image (если плагин его прописал)
    bg.style.setProperty('background','none','important');

    // Если у bg нет background-image — поднимем из <img>/srcset/компьютед
    let url = pickURLFrom(bg);
    if (!url){
      // попробуем взять из любого изображения в шапке
      const anyImg = $('img[class*="backdrop"], img[class*="background"], .full img, .full-start img, .full-start-new img', root);
      if (anyImg) url = anyImg.currentSrc || anyImg.src || null;
    }
    if (url){
      bg.style.setProperty('background-image', 'url("'+url+'")', 'important');
      bg.style.setProperty('background-position', 'center center', 'important');
      bg.style.setProperty('background-repeat', 'no-repeat', 'important');
      bg.style.setProperty('background-size', 'cover', 'important');
    }

    // Не перекрывать клики и контент
    bg.style.setProperty('pointer-events','none','important');

    // Убедимся, что экран — контекст для позиционирования, а фон под контентом
    const host = root;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    // Если у bg абсолют, зафиксируем слой сзади, но НЕ уводим на -1 (иначе может уйти за фон контейнера)
    if (getComputedStyle(bg).position === 'static') bg.style.position = 'absolute';
    // В идеале у «родного» фона уже есть top/left/right/height. На всякий случай:
    if (!bg.style.top)  bg.style.top  = '0';
    if (!bg.style.left) bg.style.left = '0';
    if (!bg.style.right)bg.style.right= '0';
    // не трогаем bottom/height — пусть остаётся как в теме/скине
    bg.style.zIndex = '0'; // контент обычно рисуется выше (по порядку DOM)
  }

  /* ======== Инициализация ======== */
  function boot(){
    if (!isTV()) return; // только TV

    // На событие экрана full
    if (window.Lampa && Lampa.Listener){
      Lampa.Listener.follow('full', function(e){
        if (e && e.type === 'complite'){
          const $root = e.object && typeof e.object.search === 'function' ? e.object.search() : null;
          const rootEl = $root && $root.length ? $root.get(0) : getFullRoot();
          applyTVFix(rootEl);

          // Следим за поздней подгрузкой бекдропа
          const mo = new MutationObserver(()=>applyTVFix(rootEl || getFullRoot()));
          if (rootEl) mo.observe(rootEl, {childList:true, subtree:true});
        }
      });
    } else {
      // Фоллбек: ловим появление экрана через MutationObserver
      const obs = new MutationObserver(()=>{
        const root = getFullRoot();
        if (root) applyTVFix(root);
      });
      obs.observe(document.body, {childList:true, subtree:true});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
