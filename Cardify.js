// @lampa-desc: Плагин преобразует привычный вид карточек, предлагая обновленный интерфейс

(function () {
  'use strict';

  // Запускаем TV режим
  try { Lampa.Platform.tv(); } catch(e){}

  function init() {
    // анти-консоль из твоего кода оставлять смысла нет — мешает дебагу

    // Блокируем неофициальные сборки так же, как у тебя
    try {
      if (Lampa.Manifest.origin !== 'bylampa') {
        Lampa.Noty.show('Ошибка доступа');
        return;
      }
    } catch (e) {}

    // Только TV
    if (!Lampa.Platform.get('tv')) {
      console.log('Cardify', 'no tv');
      return;
    }

    // 1) CSS — твой стиль + фиксы для бекдропа
    Lampa.Template.add('cardify_css', `
<style>
/* твои стили — безопасные правки */
.cardify .full-start-new__body{height:80vh}
.cardify .full-start-new__right{display:flex;align-items:flex-end}
.cardify__left{flex-grow:1}
.cardify__right{display:flex;align-items:center;flex-shrink:0}
.cardify__details{display:flex}
.cardify .full-start-new__reactions{margin:0;margin-right:-2.8em}
.cardify .full-start-new__reactions:not(.focus){margin:0}
.cardify .full-start-new__reactions:not(.focus) > div:not(:first-child){display:none}
.cardify .full-start-new__reactions:not(.focus) .reaction{position:relative}
.cardify .full-start-new__reactions:not(.focus) .reaction__count{position:absolute;top:28%;left:95%;font-size:1.2em;font-weight:500}
.cardify .full-start-new__rate-line{margin:0;margin-left:3.5em}
.cardify .full-start-new__rate-line>*:last-child{margin-right:0 !important}

/* === Фикс бекдропа ===
   1) НЕ используем background: ... (не трём картинку)
   2) создаём отдельный слой .cardify__background внутри каркаса и кладём туда image+градиент
*/
.full-start-new.cardify{position:relative}
.full-start-new.cardify .cardify__background{
  position:absolute; top:0; left:0; right:0;
  height:44vh;
  z-index:0;
  pointer-events:none;
  background-position:center center;
  background-repeat:no-repeat;
  background-size:cover;
}
/* мягкие затемнения поверх картинки — уже ВНУТРИ бэкграунда */
.full-start-new.cardify .cardify__background::after{
  content:""; position:absolute; inset:0; pointer-events:none;
  background:
    linear-gradient(to bottom, rgba(0,0,0,.80), rgba(0,0,0,0) 70%),
    linear-gradient(to top,    rgba(0,0,0,.80), rgba(0,0,0,0) 70%),
    linear-gradient(to left,   rgba(0,0,0,.80), rgba(0,0,0,0) 70%),
    linear-gradient(to right,  rgba(0,0,0,.80), rgba(0,0,0,0) 70%);
}
/* контент поверх */
.full-start-new.cardify .full-start-new__body,
.full-start-new.cardify .full-start-new__right,
.full-start-new.cardify .full-start-new__title,
.full-start-new.cardify .full-start-new__buttons,
.full-start-new.cardify .full-start-new__reactions,
.full-start-new.cardify .full-start-new__rate-line{ position:relative; z-index:1; }

/* подстраховка: штатные фоны прозрачные, но их image не трогаем */
.full-start__background,
.full-start-new__background,
.full .background { background-color:transparent !important; }
</style>
    `);

    // 2) html-каркас как у тебя (без изменений, постер слева скрыт .hide)
    Lampa.Template.add('full_start_new', `
<div class="full-start-new cardify">
  <div class="cardify__background"></div>
  <div class="full-start-new__body">
    <div class="full-start-new__left hide">
      <div class="full-start-new__poster">
        <img class="full-start-new__img full--poster"/>
      </div>
    </div>
    <div class="full-start-new__right">
      <div class="cardify__left">
        <div class="full-start-new__head"></div>
        <div class="full-start-new__title">{title}</div>
        <div class="cardify__details">
          <div class="full-start-new__details"></div>
        </div>
        <div class="full-start-new__buttons">
          <div class="full-start__button selector button--play">
            <svg width="28" height="29" viewBox="0 0 28 29" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="14" cy="14.5" r="13" stroke="currentColor" stroke-width="2.7"/>
              <path d="M18.0739 13.634C18.7406 14.0189 18.7406 14.9811 18.0739 15.366L11.751 19.0166C11.0843 19.4015 10.251 18.9204 10.251 18.1506L10.251 10.8494C10.251 10.0796 11.0843 9.5985 11.751 9.9834L18.0739 13.634Z" fill="currentColor"/>
            </svg>
            <span>#{title_watch}</span>
          </div>
          <div class="full-start__button selector button--book">
            <svg width="21" height="32" viewBox="0 0 21 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 1.5H19C19.2761 1.5 19.5 1.72386 19.5 2V27.9618C19.5 28.3756 19.0261 28.6103 18.697 28.3595L12.6212 23.7303C11.3682 22.7757 9.63183 22.7757 8.37885 23.7303L2.30302 28.3595C1.9739 28.6103 1.5 28.3756 1.5 27.9618V2C1.5 1.72386 1.72386 1.5 2 1.5Z" stroke="currentColor" stroke-width="2.5"/>
            </svg>
            <span>#{settings_input_links}</span>
          </div>
          <div class="full-start__button selector button--reaction">
            <svg width="38" height="34" viewBox="0 0 38 34" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M37.208 10.9742C37.1364 10.8013 37.0314 10.6441 36.899 10.5117C36.7666 10.3794 36.6095 10.2744 36.4365 10.2028L12.0658 0.108375C11.7166 -0.0361828 11.3242 -0.0361227 10.9749 0.108542C10.6257 0.253206 10.3482 0.530634 10.2034 0.879836L0.108666 25.2507C0.0369593 25.4236 3.37953e-05 25.609 2.3187e-08 25.7962C-3.37489e-05 25.9834 0.0368249 26.1688 0.108469 26.3418C0.180114 26.5147 0.28514 26.6719 0.417545 26.8042C0.54995 26.9366 0.707139 27.0416 0.880127 27.1131L17.2452 33.8917C17.5945 34.0361 17.9869 34.0361 18.3362 33.8917L29.6574 29.2017C29.8304 29.1301 29.9875 29.0251 30.1199 28.8928C30.2523 28.7604 30.3573 28.6032 30.4289 28.4303L37.2078 12.065C37.2795 11.8921 37.3164 11.7068 37.3164 11.5196C37.3165 11.3325 37.2796 11.1471 37.208 10.9742ZM20.425 29.9407L21.8784 26.4316L25.3873 27.885L20.425 29.9407ZM28.3407 26.0222L21.6524 23.252C21.3031 23.1075 20.9107 23.1076 20.5615 23.2523C20.2123 23.3969 19.9348 23.6743 19.79 24.0235L17.0194 30.7123L3.28783 25.0247L12.2918 3.28773L34.0286 12.2912L28.3407 26.0222Z" fill="currentColor"/>
              <path d="M25.3493 16.976L24.258 14.3423L16.959 17.3666L15.7196 14.375L13.0859 15.4659L15.4161 21.0916L25.3493 16.976Z" fill="currentColor"/>
            </svg>
            <span>#{title_reactions}</span>
          </div>
          <div class="full-start__button selector button--subscribe hide">
            <svg width="25" height="30" viewBox="0 0 25 30" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.01892 24C6.27423 27.3562 9.07836 30 12.5 30C15.9216 30 18.7257 27.3562 18.981 24H15.9645C15.7219 25.6961 14.2632 27 12.5 27C10.7367 27 9.27804 25.6961 9.03542 24H6.01892Z" fill="currentColor"/>
              <path d="M3.81972 14.5957V10.2679C3.81972 5.41336 7.7181 1.5 12.5 1.5C17.2819 1.5 21.1803 5.41336 21.1803 10.2679V14.5957C21.1803 15.8462 21.5399 17.0709 22.2168 18.1213L23.0727 19.4494C24.2077 21.2106 22.9392 23.5 20.9098 23.5H4.09021C2.06084 23.5 0.792282 21.2106 1.9273 19.4494L2.78317 18.1213C3.46012 17.0709 3.81972 15.8462 3.81972 14.5957Z" stroke="currentColor" stroke-width="2.5"/>
            </svg>
            <span>#{title_subscribe}</span>
          </div>
        </div>
      </div>
      <div class="cardify__right">
        <div class="full-start-new__reactions selector"><div>#{reactions_none}</div></div>
        <div class="full-start-new__rate-line">
          <div class="full-start__rate rate--tmdb"><div>{rating}</div><div class="source--name">TMDB</div></div>
          <div class="full-start__rate rate--imdb hide"><div></div><div>IMDB</div></div>
          <div class="full-start__rate rate--kp hide"><div></div><div>KP</div></div>
          <div class="full-start__pg hide"></div>
          <div class="full-start__status hide"></div>
        </div>
      </div>
    </div>
  </div>
  <div class="hide buttons--container">
    <div class="full-start__button view--torrent hide">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="50px" height="50px"><path d="M25,2C12.317,2,2,12.317,2,25s10.317,23,23,23s23-10.317,23-23S37.683,2,25,2z M40.5,30.963c-3.1,0-4.9-2.4-4.9-2.4 S34.1,35,27,35c-1.4,0-3.6-0.837-3.6-0.837l4.17,9.643C26.727,43.92,25.874,44,25,44c-2.157,0-4.222-0.377-6.155-1.039L9.237,16.851 c0,0-0.7-1.2,0.4-1.5c1.1-0.3,5.4-1.2,5.4-1.2s1.475-0.494,1.8,0.5c0.5,1.3,4.063,11.112,4.063,11.112S22.6,29,27.4,29 c4.7,0,5.9-3.437,5.7-3.937c-1.2-3-4.993-11.862-4.993-11.862s-0.6-1.1,0.8-1.4c1.4-0.3,3.8-0.7,3.8-0.7s1.105-0.163,1.6,0.8 c0.738,1.437,5.193,11.262,5.193,11.262s1.1,2.9,3.3,2.9c0.464,0,0.834-0.046,1.152-0.104c-0.082,1.635-0.348,3.221-0.817,4.722 C42.541,30.867,41.756,30.963,40.5,30.963z" fill="currentColor"/></svg>
      <span>#{full_torrents}</span>
    </div>
    <div class="full-start__button selector view--trailer">
      <svg height="70" viewBox="0 0 80 70" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M71.2555 2.08955C74.6975 3.2397 77.4083 6.62804 78.3283 10.9306C80 18.7291 80 35 80 35C80 35 80 51.2709 78.3283 59.0694C77.4083 63.372 74.6975 66.7603 71.2555 67.9104C65.0167 70 40 70 40 70C40 70 14.9833 70 8.74453 67.9104C5.3025 66.7603 2.59172 63.372 1.67172 59.0694C0 51.2709 0 35 0 35C0 35 0 18.7291 1.67172 10.9306C2.59172 6.62804 5.3025 3.2395 8.74453 2.08955C14.9833 0 40 0 40 0C40 0 65.0167 0 71.2555 2.08955ZM55.5909 35.0004L29.9773 49.5714V20.4286L55.5909 35.0004Z" fill="currentColor"></path></svg>
      <span>#{full_trailers}</span>
    </div>
  </div>
</div>
    `);

    // ВСТАВКА CSS и каркаса
    $('body').append(Lampa.Template.render('cardify_css', {}, true));
    $('body').append(Lampa.Template.render('full_start_new', {}, true));

    /**
     * На каждом показе экрана "full":
     *  - находим нативный фон (.full-start-new__background | .full-start__background | .full .background),
     *  - вытаскиваем url картинки (из CSS или <img/srcset>),
     *  - подставляем в наш .cardify__background внутри каркаса.
     */
    function updateBackdrop(screen) {
      var $root = screen && typeof screen.search === 'function' ? screen.search() : null;
      var $bg = $root ? $root.find('.full-start-new__background, .full-start__background, .full .background') : $();

      var url = '';
      if ($bg && $bg.length) {
        var node = $bg.get(0);
        try {
          var cs = getComputedStyle(node);
          if (cs && cs.backgroundImage && cs.backgroundImage !== 'none') {
            var m = cs.backgroundImage.match(/url\((["']?)(.*?)\1\)/);
            if (m && m[2]) url = m[2];
          }
        } catch (e) {}
        if (!url) {
          var img = $bg.find('img[src], img[srcset]').get(0);
          if (img) {
            url = img.currentSrc || img.src || '';
            if (!url && img.srcset) {
              var parts = img.srcset.split(',').map(function (s) { return s.trim(); });
              var last = parts[parts.length - 1];
              var u = last && last.split(' ')[0];
              if (u) url = u;
            }
          }
        }
      }

      var $card = $('.full-start-new.cardify');
      var $layer = $card.find('.cardify__background');
      if (!$layer.length) {
        $layer = $('<div class="cardify__background"></div>');
        $card.prepend($layer);
      }

      if (url) {
        // комбинируем картинку и мягкий градиент в ОДИН background-image (градиент не убьёт картинку)
        var bg = 'url("' + url + '")';
        $layer.css('background-image', bg);
      } else {
        // без урла — слой просто прозрачный
        $layer.css('background-image', 'none');
      }

      // Скрываем постер слева на TV (как и было задумано)
      $card.find('.full-start-new__left').addClass('hide').css('display','none');
    }

    Lampa.Listener.follow('full', function (evt) {
      if (evt && evt.type === 'complite') updateBackdrop(evt.object);
    });
  }

  if (window.app) {
    init();
  } else {
    // как у тебя: ждём готовности приложения
    Lampa.activity.follow('appready', function (e) {
      if (e && e.type === 'ready') init();
    });
  }
})();

  } else {
    boot();
  }
})();
