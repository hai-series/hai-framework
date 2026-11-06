/* eslint-disable no-var, object-shorthand, prefer-template, prefer-arrow-callback -- 此脚本须在低版本浏览器中直接执行，使用 ES5 语法。 */
;(function () {
  var agent = navigator.userAgent
  var root = document.documentElement
  var location = window.location
  var edgeHelp = 'https://support.microsoft.com/edge/microsoft-edge-update-settings'
  var chromeHelp = 'https://support.google.com/chrome/answer/95414'
  var firefoxHelp = 'https://support.mozilla.org/kb/update-firefox-latest-release'
  var safariHelp = 'https://support.apple.com/102665'
  var iosHelp = 'https://support.apple.com/118575'
  var browser = getOutdatedBrowser()

  // 匹配 Vite 8 的默认构建基线。Edge 的 UA 同时包含 Chrome，iOS 先按系统版本判断。
  function getOutdatedBrowser() {
    var version = /\b(?:CPU (?:iPhone )?OS|iPhone OS) (\d+_\d+(?:_\d+)?)/.exec(agent)
    if (version && /\b(?:iPhone|iPad|iPod)\b/.test(agent)) {
      return outdated('iOS / iPadOS', version, 16, 4, iosHelp)
    }
    version = /\b(?:EdgA?|Edge)\/(\d+(?:\.\d+)*)/.exec(agent)
    if (version) {
      return outdated('Microsoft Edge', version, 111, 0, edgeHelp)
    }
    version = /\bFirefox\/(\d+(?:\.\d+)*)/.exec(agent)
    if (version) {
      return outdated('Firefox', version, 114, 0, firefoxHelp)
    }
    version = /\bChrome\/(\d+(?:\.\d+)*)/.exec(agent)
    if (version) {
      if (/\b(?:wv|OPR\/|SamsungBrowser\/|Vivaldi\/|YaBrowser\/|HeadlessChrome\/)/.test(agent))
        return null
      return outdated('Google Chrome', version, 111, 0, chromeHelp)
    }
    version = /\bVersion\/(\d+(?:\.\d+)*)/.exec(agent)
    if (version && /\bSafari\//.test(agent)) {
      return outdated('Safari', version, 16, 4, safariHelp)
    }
    return null
  }

  function outdated(name, match, major, minor, help) {
    var version = match[1].replace(/_/g, '.')
    var parts = version.split('.')
    var currentMajor = Number(parts[0])
    var currentMinor = Number(parts[1] || 0)
    if (currentMajor > major || (currentMajor === major && currentMinor >= minor))
      return null
    return { name: name, version: version, minimum: minor ? major + '.' + minor : String(major), help: help }
  }

  function getLanguage(value) {
    var language = (value || '').toLowerCase().split(/[-_]/)[0]
    return language === 'zh' || language === 'ja' || language === 'en' ? language : ''
  }

  function openUpdatePage() {
    // 以静态脚本地址为基准，保留发布目录。仅传语言，不把原页面地址写到升级页。
    var script = document.getElementById('hai-browser-startup')
    var language = getLanguage(root.lang) || getLanguage(navigator.language) || 'en'
    location.replace(script.src.replace(/\/startup\.js$/, '/update.html') + '#' + language)
  }

  function showUpdateInstructions() {
    var locale = getLanguage(location.hash.slice(1)) || getLanguage(navigator.language) || 'en'
    var messages = {
      zh: ['浏览器版本过低', '当前使用 {name} {version}。此站点至少需要 {name} {minimum}。', '请更新到最新版本，然后重新打开此站点。', '查看官方更新说明'],
      en: ['Update your browser', 'You are using {name} {version}. This site requires {name} {minimum} or later.', 'Install the latest update, then reopen this site.', 'Official update instructions'],
      ja: ['ブラウザーを更新してください', '現在のバージョンは {name} {version} です。このサイトには {name} {minimum} 以降が必要です。', '最新版に更新してから、このサイトを開き直してください。', '公式の更新手順を見る'],
    }
    var message = messages[locale]
    var help = document.getElementById('browser-update-help')
    root.lang = locale === 'zh' ? 'zh-CN' : locale
    document.title = message[0]
    document.getElementById('browser-update-title').textContent = message[0]
    document.getElementById('browser-update-version').textContent = message[1].replace(/\{(name|version|minimum)\}/g, function (_match, key) {
      return browser[key]
    })
    document.getElementById('browser-update-instruction').textContent = message[2]
    help.textContent = message[3]
    help.href = browser.help
    help.hidden = false
  }

  if (!browser)
    return
  if (root.hasAttribute('data-hai-browser-update'))
    showUpdateInstructions()
  else
    openUpdatePage()
})()
