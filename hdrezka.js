/* @lampa { "desc": "HDRezka – онлайн-каталог с поддержкой поиска, сезонов и плейлистов" } */

(function () {
  'use strict';

  var ID = 'hdrezka_mod';
  var COMPONENT = 'hdrezka_mod';
  var SETTINGS_COMPONENT = 'hdrezka_mod_settings';
  var NAME = 'HDRezka';

  var BASE_URL = 'https://rezka.ag';
  var SEARCH_URL = BASE_URL + '/index.php?do=search&subaction=search&q=';
  var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

  function escapeHTML(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function HdrezkaNetwork() {}

  HdrezkaNetwork.prototype.fetchText = function (url, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var params = {
        method: options.method || 'GET',
        headers: Object.assign({
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'X-Requested-With': 'XMLHttpRequest'
        }, options.headers || {})
      };

      if (options.body) params.body = options.body;

      fetch(url, params)
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.text();
        })
        .then(resolve)
        .catch(reject);
    });
  };

  function parseHTML(html) {
    var parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  function parseSearch(html) {
    var doc = parseHTML(html);
    var cards = [];
    var nodes = doc.querySelectorAll('.b-content__inline_item');

    nodes.forEach(function (node) {
      var link = node.querySelector('a');
      if (!link) return;

      var href = link.getAttribute('href');
      if (!href) return;

      var posterEl = node.querySelector('img');
      var titleEl = node.querySelector('.b-content__inline_item-link a');
      var infoEl = node.querySelector('.b-content__inline_item-info');
      var originalEl = node.querySelector('.b-content__inline_item-link span');

      var title = titleEl ? titleEl.textContent.trim() : link.getAttribute('title') || 'HDRezka';
      var original = originalEl ? originalEl.textContent.trim() : '';
      var info = infoEl ? infoEl.textContent.replace(/\s+/g, ' ').trim() : '';
      var poster = posterEl ? posterEl.getAttribute('data-src') || posterEl.getAttribute('src') : '';

      cards.push({
        title: title,
        original: original,
        info: info,
        url: href.startsWith('http') ? href : BASE_URL + href,
        poster: poster,
        type: href.indexOf('/series/') !== -1 || href.indexOf('/animation/') !== -1 ? 'tv' : 'movie'
      });
    });

    if (!cards.length) {
      var fallback = doc.querySelectorAll('.b-content__inline_item-cover');
      fallback.forEach(function (node) {
        var href = node.getAttribute('href');
        if (!href) return;
        cards.push({
          title: (node.getAttribute('title') || '').trim() || 'HDRezka',
          original: '',
          info: '',
          url: href.startsWith('http') ? href : BASE_URL + href,
          poster: node.querySelector('img') ? node.querySelector('img').getAttribute('src') : '',
          type: href.indexOf('/series/') !== -1 || href.indexOf('/animation/') !== -1 ? 'tv' : 'movie'
        });
      });
    }

    return cards;
  }

  function extractScriptData(html, marker) {
    var idx = html.indexOf(marker);
    if (idx === -1) return null;

    var start = html.indexOf('(', idx);
    if (start === -1) return null;

    var depth = 0;
    var content = '';

    for (var i = start + 1; i < html.length; i++) {
      var ch = html[i];
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth < 0) break;
      }
      content += ch;
      if (depth === 0 && ch === '}') break;
    }

    try {
      return Function('"use strict";return ({' + content + '});')();
    } catch (err) {
      return null;
    }
  }

  function parsePlaylist(html) {
    var movieInit = extractScriptData(html, 'initCDNMoviesEvents');
    if (movieInit && movieInit.other_player) movieInit = null;

    var seriesInit = extractScriptData(html, 'initCDNSeriesEvents');
    if (seriesInit && seriesInit.other_player) seriesInit = null;

    if (!movieInit && !seriesInit) return null;

    if (movieInit && movieInit.player) {
      return {
        type: 'movie',
        translations: normalizeTranslations(movieInit.translation),
        streams: normalizeMovieStreams(movieInit.player, movieInit.translation)
      };
    }

    if (seriesInit && seriesInit.player) {
      return {
        type: 'series',
        translations: normalizeTranslations(seriesInit.translation),
        seasons: normalizeSeasons(seriesInit.player.seasons, seriesInit.player.season),
        episodes: normalizeEpisodes(seriesInit.player.seasons),
        streams: normalizeSeriesStreams(seriesInit.player, seriesInit.translation)
      };
    }

    return null;
  }

  function normalizeTranslations(translations) {
    if (!translations) return [];
    return Object.keys(translations).map(function (id) {
      var title = translations[id];
      if (Array.isArray(title)) title = title[0];
      return {
        id: id,
        title: String(title).trim()
      };
    });
  }

  function normalizeMovieStreams(player, translations) {
    var result = {};
    var items = player || {};

    Object.keys(items).forEach(function (trId) {
      var entry = items[trId];
      var voice = translations && translations[trId];
      var list = [];
      var playlist = entry.playlist || [];

      playlist.forEach(function (video) {
        var qualities = video.url || '';
        list = list.concat(parseQualityList(qualities));
      });

      result[trId] = {
        voice: Array.isArray(voice) ? voice[0] : voice,
        items: list,
        subtitles: parseSubtitles(entry.subtitles)
      };
    });

    return result;
  }

  function normalizeSeriesStreams(player, translations) {
    var result = {};
    var seasons = player && player.seasons ? player.seasons : {};

    Object.keys(seasons).forEach(function (seasonId) {
      var season = seasons[seasonId];
      var playlist = season.playlist || [];

      playlist.forEach(function (episode) {
        var trId = String(episode.translation_id || player.translation);
        if (!result[trId]) {
          var voice = translations && translations[trId];
          result[trId] = {
            voice: Array.isArray(voice) ? voice[0] : voice,
            seasons: {}
          };
        }

        if (!result[trId].seasons[seasonId]) {
          result[trId].seasons[seasonId] = {};
        }

        result[trId].seasons[seasonId][episode.episode_id] = {
          title: episode.title || episode.name,
          qualities: parseQualityList(episode.url || ''),
          subtitles: parseSubtitles(episode.subtitles)
        };
      });
    });

    return result;
  }

  function parseQualityList(text) {
    if (!text) return [];
    if (typeof text !== 'string') return [];

    return text.split(',').map(function (part) {
      var pieces = part.split(' or ');
      var quality = pieces[0];
      var link = pieces[pieces.length - 1];
      var match = quality.match(/\[(\d+p)]/);
      if (!match) match = link.match(/(\d{3,4}p)/);
      var label = match ? match[1] : quality.replace(/\[|\]/g, '').trim();
      return {
        quality: label,
        url: link.trim()
      };
    }).filter(function (item) { return item.url; });
  }

  function parseSubtitles(list) {
    if (!list) return [];
    if (typeof list === 'string') {
      try { list = JSON.parse(list); }
      catch (err) { return []; }
    }

    if (Array.isArray(list)) {
      return list.map(function (item) {
        return {
          label: item.label || item.title || 'Sub',
          url: item.file || item.src || ''
        };
      }).filter(function (item) { return item.url; });
    }

    return Object.keys(list).map(function (key) {
      var value = list[key];
      return {
        label: value.label || value.title || key,
        url: value.file || value.src || value
      };
    }).filter(function (item) { return item.url; });
  }

  function normalizeSeasons(seasons, current) {
    if (!seasons) return [];
    return Object.keys(seasons).map(function (id) {
      var season = seasons[id];
      return {
        id: id,
        title: season.title || ('Сезон ' + id),
        selected: String(id) === String(current)
      };
    });
  }

  function normalizeEpisodes(seasons) {
    if (!seasons) return {};
    var result = {};
    Object.keys(seasons).forEach(function (id) {
      var season = seasons[id];
      result[id] = (season.playlist || []).map(function (episode) {
        return {
          id: episode.episode_id,
          title: episode.title || episode.name || ('Серия ' + episode.episode_id)
        };
      });
    });
    return result;
  }

  function HdrezkaComponent(object) {
    var self = this;
    var network = new HdrezkaNetwork();
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var container = $('<div class="online_mod layer__body"></div>');
    var header = $('<div class="online_mod__head"></div>');
    var resultBody = $('<div class="online_mod__results"></div>');
    var status = $('<div class="online_mod__status"></div>');
    var controllerName = ID;
    var lastCard = null;
    var activeQuery = (object || {}).search || '';
    var currentResults = [];

    this.activity = object.activity;

    function setStatus(message) {
      status.text(message || '');
    }

    function toggleLoader(state) {
      if (self.activity && typeof self.activity.loader === 'function') {
        self.activity.loader(state ? true : false);
      }
    }

    function updateTitle(title) {
      if (self.activity && typeof self.activity.setTitle === 'function') {
        self.activity.setTitle(NAME + (title ? ' – ' + title : ''));
      }
    }

    function makeCard(item) {
      var poster = item.poster ? encodeURI(item.poster) : '';
      var title = item.title || 'HDRezka';
      var subtitle = item.info || item.original || '';
      var html = [
        '<div class="card selector focus--scale card--collection">',
        '  <div class="card__view">',
        '    <div class="card__img" style="background-image:url(' + poster + ')"></div>',
        '  </div>',
        '  <div class="card__title">' + escapeHTML(title) + '</div>',
        '  <div class="card__subtitle">' + escapeHTML(subtitle) + '</div>',
        '</div>'
      ].join('');

      var card = $(html);

      card.data('item', item);
      card.on('hover:focus', function () {
        lastCard = this;
        if (item.poster && Lampa.Background) {
          Lampa.Background.change(item.poster);
        }
      });
      card.on('hover:enter', function () {
        openItem(item);
      });
      return card;
    }

    function drawResults(items) {
      resultBody.empty();
      lastCard = null;
      if (!items.length) {
        setStatus('Ничего не найдено.');
        return;
      }

      var grid = $('<div class="card-list"></div>');
      items.forEach(function (item) {
        grid.append(makeCard(item));
      });
      resultBody.append(grid);
      setStatus('Найдено: ' + items.length);
    }

    function search(query) {
      if (!query) {
        setStatus('Введите название и выполните поиск.');
        resultBody.empty();
        currentResults = [];
        return;
      }

      toggleLoader(true);
      setStatus('Ищу «' + query + '»...');

      network.fetchText(SEARCH_URL + encodeURIComponent(query)).then(function (html) {
        toggleLoader(false);
        currentResults = parseSearch(html);
        drawResults(currentResults);
        updateTitle(query);
        Lampa.Controller.toggle(controllerName);
      }).catch(function (error) {
        console.error('[HDRezka] search error', error);
        toggleLoader(false);
        setStatus('Ошибка поиска.');
        Lampa.Noty.show('Не удалось выполнить поиск');
      });
    }

    function openItem(item) {
      toggleLoader(true);
      setStatus('Загружаю «' + item.title + '»...');

      network.fetchText(item.url).then(function (html) {
        toggleLoader(false);
        var playlist = parsePlaylist(html);
        if (!playlist) {
          Lampa.Noty.show('Не удалось получить плеер');
          return;
        }

        if (playlist.type === 'movie') {
          showMovieOptions(item, playlist);
        } else {
          showSeriesOptions(item, playlist);
        }
      }).catch(function (error) {
        console.error('[HDRezka] item error', error);
        toggleLoader(false);
        Lampa.Noty.show('Не удалось загрузить страницу');
      });
    }

    function showMovieOptions(item, playlist) {
      if (!playlist.translations.length) {
        Lampa.Noty.show('Нет доступных переводов');
        return;
      }

      setStatus('Доступно переводов: ' + playlist.translations.length);

      var voiceItems = playlist.translations.map(function (translation) {
        return {
          title: translation.title,
          translation: translation.id,
          selected: false
        };
      });

      Lampa.Select.show({
        title: 'Выберите перевод',
        items: voiceItems,
        onSelect: function (voice) {
          var id = voice.translation;
          var entry = playlist.streams[id];
          if (!entry) {
            Lampa.Noty.show('Поток недоступен');
            return;
          }
          chooseQuality(item, id, entry.items, entry.subtitles || []);
        },
        onBack: function () {
          Lampa.Controller.toggle(controllerName);
        }
      });
    }

    function chooseQuality(item, translationId, qualities, subtitles) {
      var list = qualities.map(function (quality) {
        return {
          title: quality.quality,
          url: quality.url,
          selected: false,
          quality: quality.quality
        };
      });

      Lampa.Select.show({
        title: 'Качество',
        items: list,
        onSelect: function (choice) {
          playStream(item, choice.url, subtitles, {
            translation: translationId,
            quality: choice.quality
          });
        },
        onBack: function () {
          Lampa.Controller.toggle(controllerName);
        }
      });
    }

    function showSeriesOptions(item, playlist) {
      if (!playlist.translations.length) {
        Lampa.Noty.show('Нет доступных переводов');
        return;
      }

      setStatus('Выберите перевод и сезон');

      var translationOptions = playlist.translations.map(function (translation) {
        return {
          title: translation.title,
          translation: translation.id
        };
      });

      Lampa.Select.show({
        title: 'Выберите перевод',
        items: translationOptions,
        onSelect: function (translation) {
          chooseSeason(item, playlist, translation.translation);
        },
        onBack: function () {
          Lampa.Controller.toggle(controllerName);
        }
      });
    }

    function chooseSeason(item, playlist, translationId) {
      var entry = playlist.streams[translationId];
      if (!entry) {
        Lampa.Noty.show('Перевод не найден');
        return;
      }

      var seasons = playlist.seasons.map(function (season) {
        return {
          title: season.title,
          id: season.id,
          selected: false
        };
      });

      setStatus('Сезонов: ' + seasons.length);

      Lampa.Select.show({
        title: 'Выберите сезон',
        items: seasons,
        onSelect: function (season) {
          chooseEpisode(item, playlist, translationId, season.id);
        },
        onBack: function () {
          Lampa.Controller.toggle(controllerName);
        }
      });
    }

    function chooseEpisode(item, playlist, translationId, seasonId) {
      var entry = playlist.streams[translationId];
      if (!entry || !entry.seasons || !entry.seasons[seasonId]) {
        Lampa.Noty.show('Серия недоступна');
        return;
      }

      var episodes = Object.keys(entry.seasons[seasonId]).map(function (episodeId) {
        var episode = entry.seasons[seasonId][episodeId];
        return {
          id: episodeId,
          title: episode.title || ('Серия ' + episodeId),
          data: episode
        };
      });

      setStatus('Серий: ' + episodes.length);

      Lampa.Select.show({
        title: 'Выберите серию',
        items: episodes.map(function (episode) {
          return {
            title: episode.title,
            episode: episode.id,
            data: episode.data
          };
        }),
        onSelect: function (episode) {
          chooseSeriesQuality(item, translationId, seasonId, episode.episode, episode.data);
        },
        onBack: function () {
          Lampa.Controller.toggle(controllerName);
        }
      });
    }

    function chooseSeriesQuality(item, translationId, seasonId, episodeId, data) {
      var qualities = data.qualities || [];
      if (!qualities.length) {
        Lampa.Noty.show('Нет потоков');
        return;
      }

      setStatus('Выберите качество');

      var list = qualities.map(function (quality) {
        return {
          title: quality.quality,
          url: quality.url,
          selected: false,
          quality: quality.quality
        };
      });

      Lampa.Select.show({
        title: 'Качество',
        items: list,
        onSelect: function (choice) {
          playStream(item, choice.url, data.subtitles || [], {
            translation: translationId,
            season: seasonId,
            episode: episodeId,
            quality: choice.quality
          });
        },
        onBack: function () {
          Lampa.Controller.toggle(controllerName);
        }
      });
    }

    function playStream(item, url, subtitles, meta) {
      if (!url) {
        Lampa.Noty.show('Ссылка не найдена');
        return;
      }

      var title = item.title;
      if (meta) {
        if (meta.season && meta.episode) title += ' • S' + meta.season + 'E' + meta.episode;
        if (meta.quality) title += ' • ' + meta.quality;
      }

      setStatus('Запуск воспроизведения…');

      Lampa.Player.play({
        title: title,
        url: url,
        subtitles: (subtitles || []).map(function (sub) {
          return {
            title: sub.label,
            url: sub.url
          };
        })
      });

      Lampa.Player.playlist([{
        title: title,
        url: url
      }]);

      Lampa.Player.listener.follow('destroy', function () {
        Lampa.Controller.toggle(controllerName);
      });
    }

    function renderHeader() {
      var wrap = $('<div class="online_mod__controls"></div>');
      var searchBtn = $('<div class="simple-button selector">Поиск</div>');
      var clearBtn = $('<div class="simple-button selector">Очистить</div>');

      searchBtn.on('hover:enter', function () {
        openSearchDialog();
      });
      clearBtn.on('hover:enter', function () {
        activeQuery = '';
        updateTitle('');
        currentResults = [];
        drawResults([]);
        setStatus('Введите название и выполните поиск.');
        Lampa.Controller.toggle(controllerName);
      });

      wrap.append(searchBtn);
      wrap.append(clearBtn);
      wrap.append(status);
      return wrap;
    }

    function openSearchDialog() {
      var inputWrap = $('<div class="modal__content"></div>');
      var input = $('<input type="text" class="modal__input" placeholder="Название" style="width:100%">');
      input.val(activeQuery);
      inputWrap.append(input);

      Lampa.Modal.open({
        title: 'Поиск на HDRezka',
        size: 'medium',
        html: inputWrap,
        onBack: function () {
          Lampa.Modal.close();
          Lampa.Controller.toggle(controllerName);
        }
      });

      input.on('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          accept();
        }
      });

      function accept() {
        var query = input.val().trim();
        Lampa.Modal.close();
        if (query) {
          activeQuery = query;
          search(query);
        } else {
          setStatus('Введите название и выполните поиск.');
          resultBody.empty();
          Lampa.Controller.toggle(controllerName);
        }
      }

      setTimeout(function () {
        input[0].focus();
        input[0].select();
      }, 10);

      inputWrap.append($('<div class="modal__buttons">\n        <div class="simple-button selector">Искать</div>\n        <div class="simple-button selector">Отмена</div>\n      </div>'));

      var buttons = inputWrap.find('.simple-button');
      buttons.eq(0).on('hover:enter', function () {
        accept();
      });
      buttons.eq(1).on('hover:enter', function () {
        Lampa.Modal.close();
        Lampa.Controller.toggle(controllerName);
      });
    }

    this.create = function () {
      if (self.activity && typeof self.activity.loader === 'function') self.activity.loader(true);

      scroll.render().addClass('layer--wheight').data('component', COMPONENT);
      scroll.body().addClass('layer__body');

      header.append(renderHeader());
      container.append(header);
      container.append(resultBody);

      scroll.body().append(container);

      this.render = function () {
        return scroll.render();
      };

      if (self.activity && typeof self.activity.loader === 'function') self.activity.loader(false);

      if (activeQuery) {
        search(activeQuery);
      } else {
        setStatus('Введите название и выполните поиск.');
        updateTitle('');
      }

      self.start();
    };

    this.start = function () {
      var controller = {
        toggle: function () {
          var first = lastCard || resultBody.find('.selector')[0] || header.find('.selector')[0];
          Lampa.Controller.collectionSet(container);
          Lampa.Controller.collectionFocus(first, container);
        },
        up: function () {
          if (typeof Navigator !== 'undefined' && Navigator.canmove('up')) Navigator.move('up');
          else controller.back();
        },
        down: function () {
          if (typeof Navigator !== 'undefined') Navigator.move('down');
        },
        left: function () {
          if (typeof Navigator !== 'undefined') Navigator.move('left');
        },
        right: function () {
          if (typeof Navigator !== 'undefined') Navigator.move('right');
        },
        back: function () {
          Lampa.Controller.toggle('content');
        }
      };

      Lampa.Controller.add(controllerName, controller);

      Lampa.Controller.toggle(controllerName);
    };

    this.pause = function () { };

    this.stop = function () { };

    this.render = function () {
      return scroll.render();
    };

    this.destroy = function () {
      scroll.destroy();
    };
  }

  function registerComponent() {
    if (registerComponent.done) return;
    registerComponent.done = true;

    Lampa.Component.add(COMPONENT, HdrezkaComponent);
  }

  function addSettingsEntry() {
    if (!Lampa.SettingsApi) return;

    Lampa.SettingsApi.addComponent({
      component: SETTINGS_COMPONENT,
      name: 'HDRezka',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:64px!important;height:64px!important;display:block"><path fill="currentColor" d="M12 2C6.48 2 2 6.29 2 11.5S6.48 21 12 21s10-4.29 10-9.5S17.52 2 12 2zm0 17c-3.87 0-7-3.36-7-7.5S8.13 4 12 4s7 3.36 7 7.5S15.87 19 12 19zm-.5-12v4.25l3.5 2.08-.75 1.23L10 12V7h1.5z"/></svg>'
    });

    Lampa.SettingsApi.addParam({
      component: SETTINGS_COMPONENT,
      param: { name: 'open', type: 'button' },
      field: { name: 'Открыть HDRezka' },
      onRender: function (item) {
        item.on('hover:enter', function () {
          Lampa.Activity.push({
            url: '',
            title: NAME,
            component: COMPONENT,
            type: 'component',
            page: 1
          });
        });
      }
    });
  }

  function registerManifest() {
    if (!Lampa.Manifest || !Lampa.Manifest.plugins) return;

    var exists = Lampa.Manifest.plugins.some(function (plugin) {
      return plugin.id === ID;
    });
    if (exists) return;

    Lampa.Manifest.plugins.push({
      id: ID,
      name: NAME,
      author: 'SimSomNat',
      version: '1.0.0',
      description: 'Просмотр фильмов и сериалов с HDRezka.',
      icon: 'https://rezka.ag/templates/hdrezka/images/logo.png',
      component: COMPONENT,
      type: 'video'
    });
  }

  function init() {
    registerManifest();
    registerComponent();
    addSettingsEntry();
  }

  if (window.appready) init();
  else Lampa.Listener.follow('app', function (event) {
    if (event.type === 'ready') init();
  });
})();
