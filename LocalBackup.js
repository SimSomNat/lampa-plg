// @lampa-desc: Локальный бэкап: экспорт/импорт закладок, истории и профилей.

(function () {
  'use strict';

  var COMPONENT = 'local_backup';

  function nowStamp() {
    var d = new Date(), p = n => String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'_'+p(d.getHours())+'-'+p(d.getMinutes())+'-'+p(d.getSeconds());
  }

  function getLS(key){
    var raw = localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(_) { return raw; }
  }
  function setLS(key, val){
    if (typeof val === 'object') localStorage.setItem(key, JSON.stringify(val));
    else localStorage.setItem(key, String(val));
  }

  function collectUserData(){
    var out = { storage: {}, __meta__: { created_at: new Date().toISOString(), filename: 'lampa_user_'+nowStamp()+'.json' } };

    // 1) favorite.{book,history,viewed,continued}
    var fav = getLS('favorite') || {};
    var favOut = {};
    ['book','history','viewed','continued'].forEach(function(k){
      if (fav && typeof fav === 'object' && k in fav) favOut[k] = fav[k];
    });
    if (Object.keys(favOut).length) out.storage['favorite'] = favOut;

    // 2) профили: все ключи с profile/profiles + account_user
    for (var i=0;i<localStorage.length;i++){
      var k = localStorage.key(i);
      if (!k) continue;
      var lk = k.toLowerCase();
      if (lk.includes('profile')) out.storage[k] = getLS(k);
      if (k === 'account_user') out.storage[k] = getLS(k);
    }

    return out;
  }

  function saveBlob(filename, blob) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 800);
      return true;
    } catch(_) { return false; }
  }
  function fallbackModal(jsonText) {
    Lampa.Select.show({
      title: 'Экспорт',
      items: [{title:'Показать JSON для копирования'}],
      onSelect: function(){
        var ctrl = (Lampa.Controller.enabled && Lampa.Controller.enabled().name) || 'settings';
        var $wrap = $('<div class="about"></div>');
        var $area = $('<textarea readonly style="width:100%;height:320px;border-radius:.7em;padding:.7em;"></textarea>').val(jsonText);
        var $btns = $('<div style="margin-top:.8em;display:flex;justify-content:flex-end;gap:.6em"></div>');
        var $copy = $('<div class="button selector">Скопировать</div>');
        var $close= $('<div class="button selector">Закрыть</div>');
        $copy.on('hover:enter', function(){
          try { $area[0].focus(); $area[0].select(); document.execCommand('copy'); Lampa.Noty.show('Скопировано'); }
          catch(_) { Lampa.Noty.show('Не скопировано'); }
        });
        $close.on('hover:enter', function(){ Lampa.Modal.close(); Lampa.Controller.toggle(ctrl); });
        $btns.append($copy,$close); $wrap.append($area,$btns);
        Lampa.Modal.open({ title:'Экспорт', html:$wrap, size:'large', onBack:function(){ Lampa.Modal.close(); Lampa.Controller.toggle(ctrl); }});
      },
      onBack: function(){ Lampa.Controller.toggle('settings'); }
    });
  }

  function confirmYesNo(title, onYes){
    Lampa.Select.show({
      title: title,
      items: [{title:'Да', yes:true}, {title:'Отмена'}],
      onSelect: function(it){ if (it.yes) onYes(); else Lampa.Noty.show('Отменено'); Lampa.Controller.toggle('settings'); },
      onBack:   function(){ Lampa.Controller.toggle('settings'); }
    });
  }

  function doExport(){
    confirmYesNo('Сохранить бэкап?', function(){
      try{
        var data = collectUserData();
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type:'application/json;charset=utf-8' });
        var ok = saveBlob(data.__meta__.filename, blob);
        if (ok) Lampa.Noty.show('Экспорт начат');
        else { fallbackModal(json); Lampa.Noty.show('Экспорт'); }
      }catch(_){ Lampa.Noty.show('Ошибка'); }
    });
  }

  function readFileAsText(file){
    return new Promise(function(res,rej){
      var r = new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(new Error('read_error')); r.readAsText(file);
    });
  }
  function doImport(){
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json'; input.style.display='none';
    document.body.appendChild(input); input.click();

    input.addEventListener('change', function(){
      var file = input.files && input.files[0];
      input.remove();
      if (!file) return;

      confirmYesNo('Импортировать бэкап?', async function(){
        try{
          var text = await readFileAsText(file);
          var parsed = JSON.parse(text);
          var st = (parsed && parsed.storage) ? parsed.storage : parsed;

          // favorite merge
          if (st.favorite && typeof st.favorite === 'object'){
            var cur = getLS('favorite') || {};
            ['book','history','viewed','continued'].forEach(function(k){
              if (k in st.favorite) cur[k] = st.favorite[k];
            });
            setLS('favorite', cur);
          }

          // profiles + account_user
          Object.keys(st).forEach(function(k){
            var lk = k.toLowerCase();
            if (k === 'favorite') return;
            if (lk.includes('profile') || k === 'account_user') setLS(k, st[k]);
          });

          Lampa.Noty.show('Импорт завершён');
        }catch(_){ Lampa.Noty.show('Ошибка'); }
      });
    }, { once:true });
  }

  function addSettings(){
    Lampa.SettingsApi.addComponent({
      component: COMPONENT,
      name: 'Локальный бэкап',
      icon: '<svg viewBox="0 0 24 24" width="1024" height="1024"><path fill="currentColor" d="M90.21875,525 L92.31875,525 L92.31875,523 L90.21875,523 L90.21875,525 Z M87.2,536 L99.8,536 L99.8,534 L87.2,534 L87.2,536 Z M87.2,532 L99.8,532 L99.8,530 L87.2,530 L87.2,532 Z M101.9,538 L85.1,538 L85.1,526.837 L87.2,524.837 L87.2,528 L88.11875,528 L89.3,528 L97.7,528 L99.47135,528 L99.8,528 L99.8,522 L101.9,522 L101.9,538 Z M89.3,522.837 L90.17885,522 L97.7,522 L97.7,526 L89.3,526 L89.3,522.837 Z M103.9664,520 L101.8664,520 L89.3,520 L89.3,520.008 L87.2084,522 L87.2,522 L87.2,522.008 L83.0084,526 L83,526 L83,538 L83,540 L85.1,540 L101.8664,540 L103.9664,540 L104,540 L104,538 L104,522 L104,520 L103.9664,520 Z"/></svg>'
    });

    Lampa.SettingsApi.addParam({
      component: COMPONENT,
      param: { name: 'export', type: 'button' },
      field: { name: 'Экспорт' },
      onRender: function(item){ item.on('hover:enter', doExport); }
    });

    Lampa.SettingsApi.addParam({
      component: COMPONENT,
      param: { name: 'import', type: 'button' },
      field: { name: 'Импорт' },
      onRender: function(item){ item.on('hover:enter', doImport); }
    });
  }

  if (window.appready) addSettings();
  else Lampa.Listener.follow('app', function(e){ if(e.type==='ready') addSettings(); });

})();
