(function () {
  'use strict';

  var COMPONENT = 'local_backup';

  function nowStamp() {
    var d = new Date();
    var pad = n => String(n).padStart(2, '0');
    return d.getFullYear()
      + '-' + pad(d.getMonth() + 1)
      + '-' + pad(d.getDate())
      + '_' + pad(d.getHours())
      + '-' + pad(d.getMinutes())
      + '-' + pad(d.getSeconds());
  }

  /** Подтверждение через модалку Lampa. Возвращает Promise<boolean> */
  function confirmDialog(title, message) {
    return new Promise(function(resolve){
      var controller = (Lampa.Controller.enabled && Lampa.Controller.enabled().name) || 'settings';

      var $wrap = $('<div class="about"></div>');
      var $msg  = $('<div style="margin-bottom:1em;line-height:1.5"></div>').text(message);
      var $btns = $('<div style="display:flex;gap:.6em"></div>');
      var $yes  = $('<div class="button selector">Да</div>');
      var $no   = $('<div class="button selector">Отмена</div>');

      $yes.on('hover:enter', function(){
        Lampa.Modal.close();
        Lampa.Controller.toggle(controller);
        resolve(true);
      });
      $no.on('hover:enter', function(){
        Lampa.Modal.close();
        Lampa.Controller.toggle(controller);
        resolve(false);
      });

      $btns.append($yes, $no);
      $wrap.append($msg, $btns);

      Lampa.Modal.open({
        title: title || 'Подтверждение',
        html:  $wrap,
        onBack: function(){
          Lampa.Modal.close();
          Lampa.Controller.toggle(controller);
          resolve(false);
        }
      });
    });
  }

  function collectBackup() {
    var dump = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var raw = localStorage.getItem(k);
        try { dump[k] = JSON.parse(raw); }
        catch (_) { dump[k] = raw; }
      }
    } catch (_) {}

    var meta = {
      created_at: new Date().toISOString(),
      filename: 'lampa_backup_' + nowStamp() + '.json',
      ua: navigator.userAgent || 'unknown'
    };

    return { __meta__: meta, storage: dump };
  }

  function saveBlob(filename, blob) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
      return true;
    } catch (e) {
      return false;
    }
  }

  function fallbackModal(jsonText) {
    var controller = (Lampa.Controller.enabled && Lampa.Controller.enabled().name) || 'settings';

    var $wrap = $('<div class="about"></div>');
    var $desc = $('<div style="margin-bottom:.8em"></div>').html(
      'Скопируйте содержимое и сохраните как <b>.json</b>.<br>Имя файла: <code>lampa_backup_'+nowStamp()+'.json</code>'
    );
    var $area = $('<textarea readonly style="width:100%;height:320px;border-radius:.7em;padding:.7em;"></textarea>');
    var $btns = $('<div style="margin-top:.8em;display:flex;gap:.6em"></div>');
    var $copy = $('<div class="button selector">Скопировать</div>');
    var $close= $('<div class="button selector">Закрыть</div>');

    $area.val(jsonText);

    $copy.on('hover:enter', function(){
      try {
        $area[0].focus(); $area[0].select();
        var ok = document.execCommand('copy');
        Lampa.Noty.show(ok ? 'Скопировано.' : 'Не удалось скопировать.');
      } catch(_) { Lampa.Noty.show('Не удалось скопировать.'); }
    });
    $close.on('hover:enter', function(){
      Lampa.Modal.close(); Lampa.Controller.toggle(controller);
    });

    $btns.append($copy, $close);
    $wrap.append($desc, $area, $btns);

    Lampa.Modal.open({
      title: 'Локальный бэкап',
      html:  $wrap,
      size:  'large',
      onBack: function(){
        Lampa.Modal.close(); Lampa.Controller.toggle(controller);
      }
    });
  }

  async function doExport() {
    var ok = await confirmDialog('Экспорт бэкапа', 'Создать и сохранить локальный бэкап настроек?');
    if (!ok) { Lampa.Noty.show('Экспорт отменён.'); return; }

    try {
      var data = collectBackup();
      var json = JSON.stringify(data, null, 2);
      var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      var saved = saveBlob(data.__meta__.filename, blob);
      if (saved) Lampa.Noty.show('Скачивание бэкапа началось.');
      else       fallbackModal(json);
    } catch (e) {
      Lampa.Noty.show('Ошибка при создании бэкапа.');
    }
  }

  function readFileAsText(file) {
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(reader.result); };
      reader.onerror= function(){ reject(new Error('read_error')); };
      reader.readAsText(file);
    });
  }

  async function doImport() {
    // Выбор файла
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.click();

    input.addEventListener('change', async function(){
      try {
        var file = input.files && input.files[0];
        input.remove();
        if (!file) return;

        var text = await readFileAsText(file);
        var parsed = JSON.parse(text);
        var data   = parsed.storage || parsed; // на случай «чистого» словаря

        var keys   = Object.keys(data || {});
        if (!keys.length) { Lampa.Noty.show('Файл пустой или неверный.'); return; }

        var ok = await confirmDialog(
          'Импорт бэкапа',
          'Импортировать ' + keys.length + ' ключей из «' + (file.name || 'backup.json') + '»? Это перезапишет существующие значения.'
        );
        if (!ok) { Lampa.Noty.show('Импорт отменён.'); return; }

        var count = 0;
        keys.forEach(function(k){
          var v = data[k];
          if (typeof v === 'object') localStorage.setItem(k, JSON.stringify(v));
          else                       localStorage.setItem(k, String(v));
          count++;
        });

        Lampa.Noty.show('Импорт завершён: ' + count + ' ключей. Перезапустите Lampa.');
      } catch (e) {
        Lampa.Noty.show('Не удалось импортировать бэкап.');
      }
    }, { once: true });
  }

  function addSettings() {
    Lampa.SettingsApi.addComponent({
      component: COMPONENT,
      name: 'Локальный бэкап',
      icon: '<svg viewBox="0 0 24 24"><path d="M12 3v10l3.5-3.5 1.4 1.4L12 17.2 7.1 10.9l1.4-1.4L12 13V3zM5 19h14v2H5z" fill="currentColor"/></svg>'
    });

    // Кнопка «Экспорт»
    Lampa.SettingsApi.addParam({
      component: COMPONENT,
      param: { name: 'local_backup_export', type: 'button' },
      field: {
        name: 'Экспорт (сохранить в файл)',
        description: 'Сохраняет все ключи localStorage Lampa в JSON.'
      },
      onRender: function(item){ item.on('hover:enter', doExport); }
    });

    // Кнопка «Импорт»
    Lampa.SettingsApi.addParam({
      component: COMPONENT,
      param: { name: 'local_backup_import', type: 'button' },
      field: {
        name: 'Импорт (загрузить из файла)',
        description: 'Выберите ранее сохранённый JSON. Значения будут перезаписаны.'
      },
      onRender: function(item){ item.on('hover:enter', doImport); }
    });
  }

  if (window.appready) addSettings();
  else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') addSettings(); });

})();
