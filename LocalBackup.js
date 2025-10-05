// @lampa-desc: Локальный бэкап (только плагины, избранное, прогресс, торренты, история поиска, сортировка меню)

(function () {
  'use strict';

  var COMPONENT = 'local_backup_selected';

  // === Конфиг — какие ключи сохраняем ===
  var KEYS = [
    'plugins',         // список плагинов (URL-ы и порядок)
    'favorite',        // закладки/избранное
    'file_view',       // прогресс просмотра файлов
    'torrents_view',   // выбранные файлы/прогресс в торрентах
    'search_history',  // история поиска
    'menu_sort'        // сортировка бокового меню
  ];

  // ---------- утилиты ----------
  function nowStamp() {
    var d = new Date(), p = n => String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'_'+p(d.getHours())+'-'+p(d.getMinutes())+'-'+p(d.getSeconds());
  }

  function getLS(key){
    var raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return null;
    try { return JSON.parse(raw); } catch(_) { return raw; }
  }
  function setLS(key, val){
    if (typeof val === 'object') localStorage.setItem(key, JSON.stringify(val));
    else localStorage.setItem(key, String(val));
  }

  function collectSelected(){
    var storage = {};
    KEYS.forEach(function(k){ storage[k] = getLS(k); });

    // Необязательная справка о плагинах для удобства (не влияет на импорт)
    var installed = [];
    try {
      if (Lampa.Plugins && typeof Lampa.Plugins.get === 'function') {
        installed = Lampa.Plugins.get() || [];
      }
    } catch(_) {}

    return {
      __meta__: {
        filename: 'lampa_selected_'+nowStamp()+'.json',
        created_at: new Date().toISOString(),
        keys: KEYS
      },
      storage: storage,
      extra: { installed_plugins: installed }
    };
  }

  // ---------- сохранение файла / фолбэк ----------
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

  // ---------- подтверждение ----------
  function confirmYesNo(title, question, onYes){
    Lampa.Select.show({
      title: title,
      items: [{title:'Да', yes:true}, {title:'Отмена'}],
      onSelect: function(it){ if (it.yes) onYes(); else Lampa.Noty.show('Отменено'); Lampa.Controller.toggle('settings'); },
      onBack:   function(){ Lampa.Controller.toggle('settings'); }
    });
  }

  // ---------- экспорт ----------
  function doExport(){
    confirmYesNo('Экспорт', 'Сохранить бэкап данных?', function(){
      try{
        var data = collectSelected();
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type:'application/json;charset=utf-8' });
        var ok = saveBlob(data.__meta__.filename, blob);
        if (ok) Lampa.Noty.show('Экспорт начат');
        else { fallbackModal(json); Lampa.Noty.show('Экспорт'); }
      }catch(_){ Lampa.Noty.show('Ошибка'); }
    });
  }

  // ---------- импорт ----------
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

      confirmYesNo('Импорт', 'Импортировать данные?', async function(){
        try{
          var text = await readFileAsText(file);
          var parsed = JSON.parse(text);
          var st = parsed && parsed.storage ? parsed.storage : parsed;

          var written = 0;
          KEYS.forEach(function(k){
            if (st.hasOwnProperty(k)) { setLS(k, st[k]); written++; }
          });

          Lampa.Noty.show('Импорт завершён. Перезапустите Lampa.');
        }catch(_){ Lampa.Noty.show('Ошибка импорта'); }
      });
    }, { once:true });
  }

  // ---------- UI ----------
  function addSettings(){
    Lampa.SettingsApi.addComponent({
      component: COMPONENT,
      name: 'Локальный бэкап',
      icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4Zm-3 2h2v4h-2V5ZM7 5h5v4H7V5Zm12 14H5V5h1v6h12V5.5L19 19Z"/></svg>'
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
