(function(){
  'use strict';

  // дождаться готовности приложения
  function ready(fn){
    if (window.appready) fn();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') fn(); });
  }

  // собрать дамп: всё из Lampa.Storage + список плагинов
  function collectDump(){
    const dump = { dt: new Date().toISOString(), storage: {}, plugins: [] };
    // 1) localStorage/Lampa.Storage
    for (let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      // по желанию — фильтруй по префиксам: if (!/^lampa|^account|^parser/.test(k)) continue;
      dump.storage[k] = localStorage.getItem(k);
    }
    // 2) список плагинов
    try { dump.plugins = (Lampa.Plugins.get && Lampa.Plugins.get()) || []; } catch(e){}
    return dump;
  }

  // сохранить файл (Blob + <a download>)
  function saveFile(name, obj){
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name; // например: lampa-backup-2025-10-03.json
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  // восстановить из выбранного JSON
  function restoreFromFile(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        try{
          const data = JSON.parse(reader.result);
          if (data.storage){
            Object.entries(data.storage).forEach(([k,v]) => localStorage.setItem(k, v));
          }
          // плагины можно накатить повторно: data.plugins?.forEach(p => Lampa.Plugins.add(p));
          Lampa.Noty.show('Восстановление завершено. Перезапустите Lampa.');
        }catch(err){ Lampa.Noty.show('Не удалось импортировать backup.json'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function addMenu(){
    // простой пункт в «Настройки → Прочее», либо отдельная кнопка в боковом меню
    const panel = Lampa.Settings; // см. как делают другие плагины (создают «раздел настроек»)
    // минимально — повесим на глобальные «Сервис» → «Плагины» подсказку-диалог
    Lampa.SettingsApi.addTitle('backup_local', 'Локальный бэкап');
    Lampa.SettingsApi.addOption({
      component: 'backup_local',
      name: 'Сохранить бэкап в файл',
      type: 'button',
      onChange: ()=>{ const dump = collectDump(); saveFile('lampa-backup-'+new Date().toISOString().slice(0,10)+'.json', dump); }
    });
    Lampa.SettingsApi.addOption({
      component: 'backup_local',
      name: 'Восстановить из файла',
      type: 'button',
      onChange: ()=> restoreFromFile()
    });
  }

  ready(addMenu);
})();
