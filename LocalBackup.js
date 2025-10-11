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
  return new Promise(function(res, rej){
    var r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('read_error'));
    r.readAsText(file);
  });
}

function doImport(){
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.click();

  input.addEventListener('change', async function(){
    var file = input.files && input.files[0];
    input.remove();
    if (!file) return;

    try{
      var text = await readFileAsText(file);
      var parsed = JSON.parse(text);
      var st = parsed && parsed.storage ? parsed.storage : parsed;

      var written = 0;
      KEYS.forEach(function(k){
        if (Object.prototype.hasOwnProperty.call(st, k)){
          setLS(k, st[k]);
          written++;
        }
      });

      Lampa.Noty.show('Импорт завершён. Перезапустите Lampa.');
    }catch(e){
      Lampa.Noty.show('Ошибка импорта: ' + (e && e.message ? e.message : 'неизвестно'));
    }
  }, { once: true });
}

  // ---------- UI ----------
  function addSettings(){
    Lampa.SettingsApi.addComponent({
      component: COMPONENT,
      name: 'Локальный бэкап',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
  style="width:64px!important;height:64px!important;display:block;vertical-align:middle;position:relative;top:-2px">
  <path fill="currentColor" d="M18.1716 1C18.702 1 19.2107 1.21071 19.5858 1.58579L22.4142 4.41421C22.7893 4.78929 23 5.29799 23 5.82843V20C23 21.6569 21.6569 23 20 23H4C2.34315 23 1 21.6569 1 20V4C1 2.34315 2.34315 1 4 1H18.1716ZM4 3C3.44772 3 3 3.44772 3 4V20C3 20.5523 3.44772 21 4 21L5 21L5 15C5 13.3431 6.34315 12 8 12L16 12C17.6569 12 19 13.3431 19 15V21H20C20.5523 21 21 20.5523 21 20V6.82843C21 6.29799 20.7893 5.78929 20.4142 5.41421L18.5858 3.58579C18.2107 3.21071 17.702 3 17.1716 3H17V5C17 6.65685 15.6569 8 14 8H10C8.34315 8 7 6.65685 7 5V3H4ZM17 21V15C17 14.4477 16.5523 14 16 14L8 14C7.44772 14 7 14.4477 7 15L7 21L17 21ZM9 3H15V5C15 5.55228 14.5523 6 14 6H10C9.44772 6 9 5.55228 9 5V3Z"/>\
</svg>'
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
