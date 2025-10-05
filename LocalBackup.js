(function () {
  'use strict';

  var COMPONENT = 'local_backup';

  function nowStamp() {
    var d = new Date();
    var p = n => String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'_'+p(d.getHours())+'-'+p(d.getMinutes())+'-'+p(d.getSeconds());
  }

  function collectBackup() {
    var dump = {};
    for (var i=0;i<localStorage.length;i++){
      var k = localStorage.key(i);
      var v = localStorage.getItem(k);
      try { dump[k] = JSON.parse(v); } catch(_) { dump[k] = v; }
    }
    return {
      __meta__: { filename: 'lampa_backup_'+nowStamp()+'.json', created_at: new Date().toISOString() },
      storage: dump
    };
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
    var ctrl = (Lampa.Controller.enabled && Lampa.Controller.enabled().name) || 'settings';
    var $wrap = $('<div class="about"></div>');
    var $area = $('<textarea readonly style="width:100%;height:320px;border-radius:.7em;padding:.7em;"></textarea>').val(jsonText);
    var $btns = $('<div style="margin-top:.8em;display:flex;justify-content:flex-end;gap:.6em"></div>');
    var $copy = $('<div class="button selector">Скопировать</div>');
    var $close= $('<div class="button selector">Закрыть</div>');
    function hi($b){ $b.css({'box-shadow':'0 0 0 2px currentColor inset','transform':'scale(1.02)'}); }
    function lo($b){ $b.css({'box-shadow':'none','transform':'none'}); }
    $copy.on('hover:focus',()=>hi($copy)).on('hover:blur',()=>lo($copy));
    $close.on('hover:focus',()=>hi($close)).on('hover:blur',()=>lo($close));

    $copy.on('hover:enter', function(){
      try { $area[0].focus(); $area[0].select(); document.execCommand('copy'); Lampa.Noty.show('Скопировано'); }
      catch(_) { Lampa.Noty.show('Не скопировано'); }
    });
    $close.on('hover:enter', function(){ Lampa.Modal.close(); Lampa.Controller.toggle(ctrl); });

    $btns.append($copy,$close);
    $wrap.append($area,$btns);

    Lampa.Modal.open({
      title: 'Экспорт',
      html: $wrap,
      size: 'large',
      onBack: function(){ Lampa.Modal.close(); Lampa.Controller.toggle(ctrl); }
    });
  }

  function confirmDialog(title, msg, options){
    options = options || {};
    return new Promise(function(resolve){
      var ctrl = (Lampa.Controller.enabled && Lampa.Controller.enabled().name) || 'settings';
      var $wrap = $('<div class="about"></div>');
      var $msg  = $('<div style="margin-bottom:.8em;line-height:1.5"></div>').text(msg||'Подтвердите действие');
      var layout = options.corners ? 'justify-content:space-between' : 'justify-content:flex-end';
      var $btns = $('<div style="display:flex;'+layout+';gap:.6em;width:100%"></div>');
      var $yes  = $('<div class="button selector">Да</div>');
      var $no   = $('<div class="button selector">Отмена</div>');

      function hi($b){ $b.css({'box-shadow':'0 0 0 2px currentColor inset','transform':'scale(1.02)'}); }
      function lo($b){ $b.css({'box-shadow':'none','transform':'none'}); }
      [$yes,$no].forEach($b=>{
        $b.on('hover:focus',()=>hi($b)).on('hover:blur',()=>lo($b));
      });

      $yes.on('hover:enter', function(){ Lampa.Modal.close(); Lampa.Controller.toggle(ctrl); resolve(true); });
      $no.on('hover:enter',  function(){ Lampa.Modal.close(); Lampa.Controller.toggle(ctrl); resolve(false); });

      $btns.append($yes,$no);
      $wrap.append($msg,$btns);

      Lampa.Modal.open({
        title: title || 'Подтверждение',
        html:  $wrap,
        onBack: function(){ Lampa.Modal.close(); Lampa.Controller.toggle(ctrl); resolve(false); }
      });
    });
  }

  async function doExport() {
    var ok = await confirmDialog('Экспорт', 'Сохранить бэкап?', { corners: true });
    if (!ok) { Lampa.Noty.show('Отменено'); return; }

    try{
      var data = collectBackup();
      var json = JSON.stringify(data, null, 2);
      var blob = new Blob([json], { type:'application/json;charset=utf-8' });
      var saved = saveBlob(data.__meta__.filename, blob);
      if (saved) Lampa.Noty.show('Экспорт начат');
      else { fallbackModal(json); Lampa.Noty.show('Экспорт'); }
    }catch(_){ Lampa.Noty.show('Ошибка'); }
  }

  function readFileAsText(file){
    return new Promise(function(res,rej){
      var r = new FileReader();
      r.onload = ()=>res(r.result);
      r.onerror= ()=>rej(new Error('read_error'));
      r.readAsText(file);
    });
  }

  async function doImport() {
    // выбрать файл
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.style.display='none';
    document.body.appendChild(input);
    input.click();

    input.addEventListener('change', async function(){
      try{
        var file = input.files && input.files[0];
        input.remove();
        if(!file) return;

        var ok = await confirmDialog('Импорт', 'Импортировать бэкап?');
        if(!ok){ Lampa.Noty.show('Отменено'); return; }

        var text = await readFileAsText(file);
        var parsed = JSON.parse(text);
        var data = parsed.storage || parsed;

        Object.keys(data||{}).forEach(function(k){
          var v = data[k];
          if (typeof v === 'object') localStorage.setItem(k, JSON.stringify(v));
          else localStorage.setItem(k, String(v));
        });

        Lampa.Noty.show('Импорт завершён');
      }catch(_){ Lampa.Noty.show('Ошибка'); }
    }, { once:true });
  }

  function addSettings(){
    Lampa.SettingsApi.addComponent({
      component: COMPONENT,
      name: 'Локальный бэкап',
      icon: '<svg viewBox="0 0 24 24"><path d="M12 3v10l3.5-3.5 1.4 1.4L12 17.2 7.1 10.9l1.4-1.4L12 13V3zM5 19h14v2H5z" fill="currentColor"/></svg>'
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
