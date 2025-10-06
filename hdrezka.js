// @lampa-desc: Онлайн-каталог HDRezka (просмотр фильмов и сериалов)

(function () {
  'use strict';

  var PLUGIN_ID = 'hdrezka';
  var SETTINGS_COMPONENT = 'hdrezka_component';
  var BASE_URL = 'https://rezka.ag';
  var AJAX_MOVIE = BASE_URL + '/ajax/get_cdn_movie/';
  var AJAX_SERIES = BASE_URL + '/ajax/get_cdn_series/';
  var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

  function log() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[' + PLUGIN_ID.toUpperCase() + ']');
    console.log.apply(console, args);
  }

  function notify(message) {
    try { Lampa.Noty.show(message); }
    catch(_) { log(message); }
  }

  function showError(message, error) {
    if (error) log(message, error);
    notify(message);
  }

  function request(url, options) {
    options = options || {};
    var headers = Object.assign({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.7,en;q=0.6',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'User-Agent': USER_AGENT,
      'X-Requested-With': 'XMLHttpRequest'
    }, options.headers || {});

    return fetch(url, Object.assign({ headers: headers, credentials: 'omit' }, options)).then(function (response) {
      if (!response.ok) {
        var err = new Error('HTTP ' + response.status + ' for ' + url);
        err.status = response.status;
        throw err;
      }
      var contentType = response.headers.get('content-type') || '';
      if (contentType.indexOf('application/json') !== -1) return response.json();
      return response.text();
    });
  }

  function requestText(url, options) {
    return request(url, options).then(function (data) {
      if (typeof data === 'string') return data;
      return JSON.stringify(data);
    });
  }

  function requestJSON(url, options) {
    return request(url, Object.assign({
      headers: { 'Accept': 'application/json, text/javascript, */*; q=0.01' }
    }, options || {})).then(function (data) {
      if (typeof data === 'string') {
        try { return JSON.parse(data); }
        catch (e) { throw new Error('JSON parse error for ' + url); }
      }
      return data;
    });
  }

  function parseHTML(text) {
    var parser = new DOMParser();
    return parser.parseFromString(text, 'text/html');
  }

  function safeEvalObjectLiteral(source) {
    try {
      return Function('"use strict";return (' + source + ')')();
    } catch (err) {
      log('safeEvalObjectLiteral error', err);
      throw err;
    }
  }

  function parseSearchResults(html) {
    var doc = parseHTML(html);
    var items = [];

    var nodes = doc.querySelectorAll('.b-content__inline_item');
    nodes.forEach(function (node) {
      try {
        var link = node.querySelector('a');
        if (!link) return;
        var href = link.getAttribute('href');
        if (!href) return;

        var titleEl = node.querySelector('.b-content__inline_item-link a') || node.querySelector('.b-content__inline_item-link');
        var originalEl = node.querySelector('.b-content__inline_item-link span');
        var infoEl = node.querySelector('.b-content__inline_item-info');
        var posterEl = node.querySelector('img');

        var title = titleEl ? titleEl.textContent.trim() : link.getAttribute('title') || 'Без названия';
        var original = '';
        if (originalEl) original = originalEl.textContent.trim();
        var info = infoEl ? infoEl.textContent.replace(/\s+/g, ' ').trim() : '';
        var poster = posterEl ? posterEl.getAttribute('data-src') || posterEl.getAttribute('src') : '';

        items.push({
          title: title,
          subtitle: original || info,
          info: info,
          url: href.startsWith('http') ? href : BASE_URL + href,
          poster: poster,
          type: href.indexOf('/series/') !== -1 || href.indexOf('/animation/') !== -1 ? 'tv' : 'movie'
        });
      } catch (e) {
        log('parseSearch item error', e);
      }
    });

    if (!items.length) {
      var altNodes = doc.querySelectorAll('.b-content__inline_item-cover');
      altNodes.forEach(function (node) {
        try {
          var href = node.getAttribute('href');
          if (!href) return;
          items.push({
            title: (node.getAttribute('title') || '').trim() || 'HDRezka',
            subtitle: '',
            info: '',
            url: href.startsWith('http') ? href : BASE_URL + href,
            poster: node.querySelector('img') ? node.querySelector('img').getAttribute('src') : '',
            type: href.indexOf('/series/') !== -1 || href.indexOf('/animation/') !== -1 ? 'tv' : 'movie'
          });
        } catch (err) {
          log('parse alt item error', err);
        }
      });
    }

    return items;
  }

  function extractInitCall(html, marker) {
    var idx = html.indexOf(marker);
    if (idx === -1) return null;
    var start = html.indexOf('(', idx);
    if (start === -1) return null;
    var depth = 0;
    var body = '';
    for (var i = start + 1; i < html.length; i++) {
      var ch = html[i];
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth < 0) break;
      }
      body += ch;
      if (depth === 0 && ch === '}') break;
    }
    if (!body) return null;
    return '{' + body;
  }

  function extractPlayerData(html) {
    var movieRaw = extractInitCall(html, 'initCDNMoviesEvents');
    if (movieRaw) {
      try {
        var movieData = safeEvalObjectLiteral(movieRaw);
        movieData.__kind = 'movie';
        return movieData;
      } catch (e) {
        log('parse movie data error', e);
      }
    }

    var seriesRaw = extractInitCall(html, 'initCDNSeriesEvents');
    if (seriesRaw) {
      try {
        var seriesData = safeEvalObjectLiteral(seriesRaw);
        seriesData.__kind = 'series';
        return seriesData;
      } catch (err) {
        log('parse series data error', err);
      }
    }

    return null;
  }

  function normalizeTranslations(data) {
    var list = [];
    if (!data) return list;

    if (Array.isArray(data)) {
      data.forEach(function (item) {
        if (item && (item.title || item.name || item.voice)) {
          list.push({
            id: item.id || item.translation_id || item.voice_id || item.value || item.slug || list.length + 1,
            title: item.title || item.name || item.voice || item.label || 'Перевод ' + (list.length + 1)
          });
        }
      });
      return list;
    }

    Object.keys(data).forEach(function (key) {
      var value = data[key];
      if (!value) return;
      if (typeof value === 'string') list.push({ id: key, title: value });
      else if (value && typeof value === 'object') list.push({ id: value.id || key, title: value.title || value.name || String(key) });
    });
    return list;
  }

  function normalizeQualities(media) {
    var items = [];
    if (!media) return items;

    var pushItem = function (quality, translation, url) {
      if (!url) return;
      items.push({ quality: quality, translation: translation, url: url });
    };

    if (Array.isArray(media)) {
      media.forEach(function (entry) {
        if (!entry) return;
        if (typeof entry === 'string') pushItem('auto', null, entry);
        else if (typeof entry === 'object') {
          Object.keys(entry).forEach(function (key) {
            var value = entry[key];
            if (Array.isArray(value)) value.forEach(function (u) { pushItem(key, null, u); });
            else pushItem(key, null, value);
          });
        }
      });
      return items;
    }

    Object.keys(media).forEach(function (quality) {
      var value = media[quality];
      if (!value) return;
      if (typeof value === 'string') pushItem(quality, null, value);
      else if (Array.isArray(value)) value.forEach(function (url) { pushItem(quality, null, url); });
      else if (typeof value === 'object') {
        Object.keys(value).forEach(function (key) {
          var val = value[key];
          if (Array.isArray(val)) val.forEach(function (url) { pushItem(quality, key, url); });
          else pushItem(quality, key, val);
        });
      }
    });

    return items;
  }

  function buildSeriesStructure(data) {
    var seasons = [];
    var rawSeasons = data.seasons || data.season || data.playlist || [];

    if (Array.isArray(rawSeasons)) {
      rawSeasons.forEach(function (season, idx) {
        if (!season) return;
        var episodes = [];
        var rawEpisodes = season.episodes || season.series || season.items || [];
        if (Array.isArray(rawEpisodes)) {
          rawEpisodes.forEach(function (episode, eidx) {
            if (!episode) return;
            episodes.push({
              id: episode.id || episode.episode_id || episode.series_id || episode.sid || (eidx + 1),
              title: episode.title || episode.name || episode.series || episode.episode || ('Серия ' + (eidx + 1)),
              data: episode
            });
          });
        }
        seasons.push({
          id: season.id || season.season_id || season.sid || (idx + 1),
          title: season.title || season.name || ('Сезон ' + (idx + 1)),
          episodes: episodes
        });
      });
    } else if (typeof rawSeasons === 'object') {
      Object.keys(rawSeasons).forEach(function (key) {
        var season = rawSeasons[key];
        if (!season) return;
        var episodes = [];
        var rawEpisodes = season.episodes || season.series || season.items || [];
        if (Array.isArray(rawEpisodes)) {
          rawEpisodes.forEach(function (episode, eidx) {
            if (!episode) return;
            episodes.push({
              id: episode.id || episode.episode_id || episode.series_id || episode.sid || (eidx + 1),
              title: episode.title || episode.name || episode.series || episode.episode || ('Серия ' + (eidx + 1)),
              data: episode
            });
          });
        }
        seasons.push({
          id: season.id || key,
          title: season.title || season.name || ('Сезон ' + key),
          episodes: episodes
        });
      });
    }

    return seasons;
  }

  function decodeSourceUrl(url) {
    if (!url) return '';
    var decoded = url;
    try {
      decoded = decoded.replace(/\\\//g, '/');
      decoded = decoded.replace(/\u0026/g, '&');
    } catch (_) {}
    return decoded;
  }

  function flattenSubtitles(subs) {
    var list = [];
    if (!subs) return list;
    if (Array.isArray(subs)) {
      subs.forEach(function (item) {
        if (!item) return;
        var url = item.url || item.src || item.file;
        if (!url) return;
        list.push({
          label: item.label || item.title || item.name || 'Sub',
          url: decodeSourceUrl(url)
        });
      });
      return list;
    }

    Object.keys(subs).forEach(function (key) {
      var item = subs[key];
      if (!item) return;
      if (typeof item === 'string') list.push({ label: key, url: decodeSourceUrl(item) });
      else {
        var url = item.url || item.src || item.file;
        if (!url) return;
        list.push({ label: item.label || item.title || item.name || key, url: decodeSourceUrl(url) });
      }
    });
    return list;
  }

  function prepareMovieStreams(movieData) {
    var media = movieData.url || movieData.urls || movieData.playlist || movieData.files || movieData.media || movieData.streams;
    var list = normalizeQualities(media);
    if (!list.length && movieData.cdn) list = normalizeQualities(movieData.cdn);
    if (!list.length && movieData.sources) list = normalizeQualities(movieData.sources);

    var translations = normalizeTranslations(movieData.translations || movieData.translation || movieData.voices);
    var subtitles = flattenSubtitles(movieData.subtitle || movieData.subtitles || movieData.subs);

    return {
      kind: 'movie',
      id: movieData.id || movieData.film_id || movieData.kinopoisk_id || null,
      hash: movieData.hash || movieData.film_hash || null,
      streams: list.map(function (item, idx) {
        return {
          id: idx + 1,
          quality: item.quality || 'auto',
          translation: item.translation || (translations[0] ? translations[0].title : null),
          url: decodeSourceUrl(item.url),
          subtitles: subtitles,
          translatorId: translations[0] ? translations[0].id : null
        };
      }),
      translations: translations,
      subtitles: subtitles
    };
  }

  function prepareSeriesStructure(seriesData) {
    var translations = normalizeTranslations(seriesData.translations || seriesData.translation || seriesData.voices || seriesData.dubs);
    var seasons = buildSeriesStructure(seriesData);
    var defaultSeason = seriesData.default_season || seriesData.season || (seasons[0] ? seasons[0].id : null);
    var defaultEpisode = seriesData.default_episode || seriesData.episode || ((seasons[0] && seasons[0].episodes[0]) ? seasons[0].episodes[0].id : null);
    var defaultTranslator = seriesData.default_translation || seriesData.default_translator || (translations[0] ? translations[0].id : null);

    return {
      kind: 'series',
      id: seriesData.id || seriesData.serial_id || seriesData.film_id || null,
      hash: seriesData.hash || seriesData.film_hash || null,
      seasons: seasons,
      translations: translations,
      defaults: {
        season: defaultSeason,
        episode: defaultEpisode,
        translator: defaultTranslator
      }
    };
  }

  function askQuery() {
    return new Promise(function (resolve) {
      try {
        if (Lampa.Input && typeof Lampa.Input.edit === 'function') {
          Lampa.Input.edit({
            title: 'Поиск по HDRezka',
            free: true,
            value: '',
            nosave: true,
            maxlength: 120,
            onChange: function (value) {
              resolve((value || '').trim());
            },
            onBack: function () {
              resolve('');
            }
          });
          return;
        }
      } catch (e) {
        log('askQuery Input.edit error', e);
      }

      var text = prompt('Введите запрос для поиска на HDRezka');
      resolve((text || '').trim());
    });
  }

  function showSearchResults(query, items) {
    if (!items.length) {
      notify('Ничего не найдено по запросу «' + query + '»');
      return;
    }

    var controllerName = 'content';
    Lampa.Select.show({
      title: 'HDRezka — результаты поиска',
      items: items.map(function (item) {
        return {
          title: item.title,
          subtitle: item.subtitle || item.info || '',
          poster: item.poster,
          url: item.url,
          type: item.type
        };
      }),
      onSelect: function (item) {
        openItemDetails(item);
      },
      onBack: function () {
        Lampa.Controller.toggle(controllerName);
      }
    });
  }

  function chooseStream(streams, meta) {
    if (!streams.length) {
      notify('Не удалось получить ссылки на видео');
      return;
    }

    var items = streams.map(function (stream) {
      var title = [];
      if (stream.translation) title.push(stream.translation);
      if (stream.quality) title.push(stream.quality);
      if (!title.length) title.push('Ссылка');
      return {
        title: title.join(' • '),
        url: stream.url,
        stream: stream
      };
    });

    Lampa.Select.show({
      title: meta.title,
      items: items,
      onSelect: function (item) {
        playStream(item.stream, meta);
      },
      onBack: function () {
        Lampa.Controller.toggle('content');
      }
    });
  }

  function playStream(stream, meta) {
    var source = {
      url: stream.url,
      quality: stream.quality || 'auto',
      title: meta.title + (stream.translation ? ' • ' + stream.translation : '') + (stream.quality ? ' • ' + stream.quality : ''),
      subtitles: stream.subtitles || []
    };

    try {
      if (Lampa.Player && typeof Lampa.Player.play === 'function') {
        Lampa.Player.play(Object.assign({
          url: source.url,
          title: source.title,
          quality: source.quality,
          timeline: false,
          subtitles: source.subtitles
        }, meta.player || {}));
        return;
      }
    } catch (e) {
      log('Player.play error', e);
    }

    try {
      if (Lampa.Player && typeof Lampa.Player.open === 'function') {
        Lampa.Player.open(Object.assign({
          title: source.title,
          url: source.url,
          subtitles: source.subtitles
        }, meta.player || {}));
        return;
      }
    } catch (err) {
      log('Player.open fallback error', err);
    }

    try {
      if (Lampa.Platform && typeof Lampa.Platform.open === 'function') {
        Lampa.Platform.open(source.url);
        notify('Видео открыто во внешнем плеере');
        return;
      }
    } catch (ex) {
      log('Platform.open error', ex);
    }

    window.open(source.url, '_blank');
  }

  function requestMovieFromAjax(meta, translatorId) {
    var body = new URLSearchParams();
    if (meta.id) body.set('id', meta.id);
    if (translatorId) body.set('translator_id', translatorId);
    body.set('action', 'get_movie');

    return requestJSON(AJAX_MOVIE, {
      method: 'POST',
      body: body.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      }
    }).then(function (json) {
      if (!json || json.error) throw new Error('HDRezka вернул ошибку');
      var data = json.data || json;
      var prepared = prepareMovieStreams(data);
      if (!prepared.streams.length && json.url) {
        prepared.streams.push({ url: decodeSourceUrl(json.url), quality: 'auto', translation: null, subtitles: flattenSubtitles(json.subtitle || json.subtitles) });
      }
      return prepared.streams;
    }).catch(function (err) {
      log('requestMovieFromAjax error', err);
      return [];
    });
  }

  function requestSeriesStream(meta, translatorId, seasonId, episodeId) {
    var body = new URLSearchParams();
    if (meta.id) body.set('id', meta.id);
    if (translatorId) body.set('translator_id', translatorId);
    if (seasonId) body.set('season_id', seasonId);
    if (episodeId) body.set('episode_id', episodeId);
    body.set('action', 'get_stream');

    return requestJSON(AJAX_SERIES, {
      method: 'POST',
      body: body.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      }
    }).then(function (json) {
      if (!json || json.error) throw new Error('HDRezka вернул ошибку');
      var data = json.data || json;
      var media = data.url || data.urls || data.playlist || data.files || data.streams;
      var streams = normalizeQualities(media);
      if (!streams.length && data.src) streams = normalizeQualities(data.src);
      var subtitles = flattenSubtitles(data.subtitle || data.subtitles || data.subs);
      return streams.map(function (item) {
        return {
          url: decodeSourceUrl(item.url),
          quality: item.quality || 'auto',
          translation: data.voice || data.translation || null,
          subtitles: subtitles
        };
      });
    }).catch(function (err) {
      log('requestSeriesStream error', err);
      return [];
    });
  }

  function openMovie(meta, moviePrepared) {
    var baseStreams = (moviePrepared && moviePrepared.streams) || [];
    if (baseStreams.length) {
      chooseStream(baseStreams, meta);
      return;
    }

    var translatorId = moviePrepared && moviePrepared.translations && moviePrepared.translations[0] ? moviePrepared.translations[0].id : null;
    requestMovieFromAjax(moviePrepared || meta, translatorId).then(function (streams) {
      if (!streams.length) {
        showError('Не удалось получить ссылки на фильм');
        return;
      }
      chooseStream(streams, meta);
    });
  }

  function pickSeason(meta, structure) {
    if (!structure.seasons.length) {
      notify('Не найдены сезоны');
      return;
    }

    var translatorId = structure.defaults.translator;

    Lampa.Select.show({
      title: meta.title + ' — выбор сезона',
      items: structure.seasons.map(function (season) {
        return { title: season.title, season: season };
      }),
      onSelect: function (item) {
        pickEpisode(meta, structure, item.season, translatorId);
      },
      onBack: function () {
        Lampa.Controller.toggle('content');
      }
    });
  }

  function pickEpisode(meta, structure, season, translatorId) {
    if (!season || !season.episodes.length) {
      notify('В сезоне нет серий');
      return;
    }

    Lampa.Select.show({
      title: season.title + ' — выбор серии',
      items: season.episodes.map(function (episode) {
        return { title: episode.title, episode: episode };
      }),
      onSelect: function (item) {
        var episode = item.episode;
        requestSeriesStream(structure, translatorId, season.id, episode.id).then(function (streams) {
          if (!streams.length) {
            showError('Не удалось получить ссылку на серию');
            return;
          }
          chooseStream(streams, {
            title: meta.title + ' • ' + season.title + ' • ' + episode.title
          });
        });
      },
      onBack: function () {
        pickSeason(meta, structure);
      }
    });
  }

  function openSeries(meta, structure) {
    pickSeason(meta, structure);
  }

  function openItemDetails(item) {
    notify('Загрузка данных…');
    requestText(item.url).then(function (html) {
      var playerData = extractPlayerData(html);
      if (!playerData) {
        showError('Не удалось найти данные для воспроизведения');
        return;
      }

      if (playerData.__kind === 'movie') {
        var prepared = prepareMovieStreams(playerData);
        if (!prepared.streams.length) {
          requestMovieFromAjax(prepared, null).then(function (streams) {
            if (!streams.length) {
              showError('Не удалось получить ссылки на фильм');
              return;
            }
            chooseStream(streams, { title: item.title });
          });
        } else {
          openMovie({ title: item.title }, prepared);
        }
      } else if (playerData.__kind === 'series') {
        var structure = prepareSeriesStructure(playerData);
        if (!structure.seasons.length) {
          showError('Не удалось определить сезоны сериала');
          return;
        }
        openSeries({ title: item.title }, structure);
      } else {
        showError('Неизвестный тип контента');
      }
    }).catch(function (err) {
      showError('Ошибка загрузки страницы', err);
    });
  }

  function performSearch(query) {
    if (!query) return;

    notify('Поиск по HDRezka…');
    var url = BASE_URL + '/search/?do=search&subaction=search&q=' + encodeURIComponent(query);

    requestText(url).then(function (html) {
      var results = parseSearchResults(html);
      showSearchResults(query, results);
    }).catch(function (err) {
      showError('Ошибка поиска HDRezka', err);
    });
  }

  function openMain() {
    askQuery().then(function (query) {
      if (!query) {
        notify('Поиск отменён');
        return;
      }
      performSearch(query);
    });
  }

  function addSettings() {
    try {
      Lampa.SettingsApi.addComponent({
        component: SETTINGS_COMPONENT,
        name: 'HDRezka',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:64px!important;height:64px!important;display:block">\
  <path fill="currentColor" d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 2c3.86 0 7 3.14 7 7 0 1.37-.398 2.645-1.08 3.73l-9.65-9.65C9.356 4.398 10.63 4 12 4zM6.08 7.27l9.65 9.65C14.644 19.602 13.37 20 12 20c-3.86 0-7-3.14-7-7 0-1.37.398-2.644 1.08-3.73z"/>\
</svg>'
      });

      Lampa.SettingsApi.addParam({
        component: SETTINGS_COMPONENT,
        param: { name: 'open', type: 'button' },
        field: { name: 'Открыть каталог HDRezka' },
        onRender: function (item) {
          item.on('hover:enter', openMain);
        }
      });
    } catch (e) {
      log('Settings integration failed', e);
    }
  }

  function init() {
    log('init');
    addSettings();
  }

  if (window.appready) init();
  else if (window.Lampa && Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
    Lampa.Listener.follow('app', function (event) {
      if (event && event.type === 'ready') init();
    });
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();

