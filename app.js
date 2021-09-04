'use strict'

// Параметры логирования
const logs = {
  format: '$name $ip $statusCode $statusMessage $method $forward_href $target_href',
  file: false
}

// Методы логирования
const dt = () => new Date().toLocaleDateString()
const tt = () => new Date().toLocaleTimeString()
const log = {
  file(msg) {
    if (logs.file) fs.appendFileSync(logs.file, `[${dt()} ${tt()}] ${msg}\n`, 'utf8')
  },
  trace(msg) {
    this.file(msg)
    console.log('\x1b[90m[%s %s] \x1b[90m%s\x1b[0m', dt(), tt(), msg)
  },
  info(msg) {
    this.file(msg)
    console.log('\x1b[90m[%s %s] \x1b[32m%s\x1b[0m', dt(), tt(), msg)
  },
  warn(msg) {
    this.file(msg)
    console.log('\x1b[90m[%s %s] \x1b[93m%s\x1b[0m', dt(), tt(), msg)
  },
  error(msg) {
    this.file(msg)
    console.log('\x1b[90m[%s %s] \x1b[31m%s\x1b[0m', dt(), tt(), msg)
  }
}

// Необработанные ошибки
process.on('uncaughtException', (e) => {
  log.error(e)
  process.exit(1)
})

// Работа c системой
const os = require('os')
const fs = require('fs')
const path = require('path')

// Парсинг файла конфигурации
const YAML = require('yaml')

// Проксирование запросов
const net = require('net')
const {URL} = require('url')
const http = require('http')
const https = require('https')
const {createProxyServer} = require('http-proxy')
const HttpProxyRules = require('http-proxy-rules')

// Работа с туннелями NGROK
const ngrok = require('ngrok')

// Загрузка конфигурации
const config = getConfig()

// Формирование параметров сервера
const listen = {
  host: config['host'] === 'localhost' ? '127.0.0.1' : config['host'] || '127.0.0.1',
  port: config['port'] || 3000,
  https: null,
  urls: []
}
listen.urls = (() => {
  const proto = 'http'
  const urls = []

  switch (listen.host) {
    case '127.0.0.1':
      urls.push(new URL(`${proto}://localhost:${listen.port}`))
      urls.push(new URL(`${proto}://127.0.0.1:${listen.port}`))
      break
    case '0.0.0.0':
      urls.push(new URL(`${proto}://localhost:${listen.port}`))
      urls.push(new URL(`${proto}://127.0.0.1:${listen.port}`))
      try {
        Object.entries(os.networkInterfaces()).forEach(([, interfaces]) => {
          interfaces.forEach((face) => {
            if ('IPv4' !== face.family || face.internal !== false) return
            urls.push(new URL(`${proto}://${face.address}:${listen.port}`))
          })
        })
      } catch {}
      break
    default:
      urls.push(new URL(`${proto}://${listen.host}:${listen.port}`))
  }

  return urls
})()

// Настройка логирования
if (typeof config['logs'] === 'string') logs.format = config['logs']
if (config?.['logs']?.['format']) logs.format = config['logs']['format']
if (config?.['logs']?.['file']) {
  logs.file = `./foramina.log`
  fs.appendFileSync(logs.file, `Run script ${new Date().toISOString()}\n`, 'utf8')
}

// Правила маршрутизации
const routingRules = {}

// Экземпляр сервера
const httpServer = http.createServer()
const httpsServer = https.createServer({
  key: fs.readFileSync(path.join(__dirname, 'cert', 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'cert', 'cert.pem'))
})

// Экземпляр прокси
const proxy = createProxyServer()

// Логирование запросов прокси
proxy.on('proxyRes', (proxyRes, req) => {
  req.foramina.$statusCode = proxyRes?.statusCode
  req.foramina.$statusMessage = proxyRes?.statusMessage
  const msg = format(req.foramina)
  if (req.foramina.$statusCode >= 500) log.error(msg)
  else if (req.foramina.$statusCode >= 400) log.warn(msg)
  else if (req.foramina.$statusCode >= 300) log.trace(msg)
  else log.info(msg)
})

// Логирование ошибок прокси
proxy.on('error', (e, req, res) => {
  if (res) {
    res.writeHead(444)
    res.end()
  }
  if (req) {
    req.foramina.$statusMessage = e.message
    log.error(format(req.foramina))
  } else throw e
})

// Поддержка протокола HTTPS
httpServer.on('connect', (req, socket, head) => {
  const host = req.url.split(':')[0]
  const port = Number(req.url.split(':')?.[1] || 443)

  const routingRule = routingRules[host] || routingRules['any']
  if (!routingRule && !config['revers']) socket.end()
  else {
    if (!routingRule) {
      log.info(
        format({
          $ip: req?.connection?.remoteAddress || req?.socket?.remoteAddress || req?.connection?.socket?.remoteAddress,
          $statusMessage: 'PROXY',
          $method: req.method,
          $forward: new URL(`https://${host}`),
          $target: new URL(`https://${host}`)
        })
      )
    }

    const proxySocket = new net.Socket()
    proxySocket.connect(routingRule ? listen.https : port, routingRule ? '127.0.0.1' : host, () => {
      proxySocket.write(head)
      socket.write(`HTTP/${req.httpVersion} 200 Connection established\r\n\r\n`)
    })

    proxySocket.on('data', (chunk) => socket.write(chunk))
    proxySocket.on('end', () => socket.end())

    proxySocket.on('error', (e) => {
      log.error(e)
      socket.write(`HTTP/${req.httpVersion} 500 Connection error\r\n\r\n`)
      socket.end()
    })

    socket.on('data', (chunk) => proxySocket.write(chunk))
    socket.on('end', () => proxySocket.end())

    socket.on('error', (e) => {
      log.error('  > ERR: %s', e)
      proxySocket.end()
    })
  }
})

// Поддержка протокола WEBSOCKET
const onUpgrade = (req, socket, head) => {
  const opts = configureObj(req)
  req.foramina.$statusMessage = 'UPGRADE'
  if (opts) {
    log.info(format(req.foramina))
    proxy.ws(req, socket, head, opts)
  } else socket.end()
}

httpServer.on('upgrade', onUpgrade)
httpsServer.on('upgrade', onUpgrade)

// Обработка входящих запросов
const onRequest = (req, res) => {
  const opts = configureObj(req)
  if (opts) return proxy.web(req, res, opts)

  if (config['revers'] && !listen.urls.filter((e) => e.origin === req.foramina.$forward.origin).length) {
    req.foramina.$target = req.foramina.$forward
    return proxy.web(req, res, {target: req.foramina.$forward.href})
  }

  log.error(format(req.foramina))
  res.writeHead(444)
  res.end()
}

httpServer.on('request', onRequest)
httpsServer.on('request', onRequest)

// Инициализация
;(async () => {
  // Индикатор загрузки бинарных файлов NGROK
  let loadingBinFile = false

  // Формирование правил маршрутизации
  for (const route of config['routing'] || []) {
    if (!route['active']) continue

    const routingRule = {
      name: route['name'],
      proxy: Object.assign({}, config['proxy'] || {}, route['opts'] || {}),
      rules: new HttpProxyRules(typeof route['target'] === 'string' ? {default: route['target']} : route['target']),
      match(req) {
        const target = this.rules.match(req)
        if (target) return Object.assign({}, this.proxy, {target})
        return null
      }
    }

    // Привязка правил маршрутизации
    if (typeof route['forward'] === 'string') route['forward'] = [route['forward']]
    route['forward'].forEach((forward) => (routingRules[forward] = routingRule))

    // Запуск туннеля NGROK
    if (route['tunnel'] === true || (route['tunnel'] && route?.['tunnel']?.['active'] !== false)) {
      const copyBinPath = './bin'
      const ngrokBinPath = path.join(__dirname, 'node_modules', 'ngrok', 'bin')
      const getBinPath = () => (process['pkg'] ? copyBinPath : ngrokBinPath)

      // Управление бинарными файлами NGROK
      if (process['pkg'] && !loadingBinFile) {
        await fs.promises.mkdir(copyBinPath, {recursive: true})
        fs.readdirSync(ngrokBinPath).forEach((file) => {
          fs.writeFileSync(path.join(copyBinPath, file), fs.readFileSync(path.join(ngrokBinPath, file)))
        })
        loadingBinFile = true
      }

      // Формирование настроек туннеля
      try {
        const addr = `${listen.host}:${listen.port}`
        const cfg = Object.assign({}, config['ngrok'] || {}, route?.['tunnel']?.['opts'] || {}, {addr})
        const url = new URL(await ngrok['connect']({binPath: getBinPath, ...cfg}))
        routingRules[url.hostname] = routingRule
        log.info(`Created tunnel ${route['name'] || '-'} ${url.href}`)
      } catch (e) {
        let details
        try {
          details = e.body.details.err.split('\n')[0]
        } catch {}
        throw new Error(details || e.message)
      }
    }
  }

  // Запуск сервера
  let httpsServerRunCount = 10
  const port = () => Math.floor(Math.random() * (55000 - 50000)) + 50000
  httpsServer.listen(port(), '127.0.0.1')
  httpsServer.on('error', (e) => {
    if (e && httpsServerRunCount < 1) throw e
    log.warn('Server https port in use, retrying...')
    httpsServerRunCount--
    httpsServer.close()
    httpsServer.listen(port(), '127.0.0.1')
  })

  httpsServer.on('listening', () => {
    listen.https = httpsServer.address()?.['port']
    httpServer.listen(listen.port, listen.host)
  })
  httpServer.on('listening', () => {
    listen.urls.forEach((url) => log.info(`Server listening at ${url.href}`))
  })
})()

/**
 * Загрузка конфигурации
 * Если файл отсутствует используется default example
 * @returns {object}
 */
function getConfig() {
  const cfg = './config.yml'
  if (process['pkg'])
    try {
      fs.accessSync(cfg, fs.constants.R_OK)
    } catch {
      fs.writeFileSync(cfg, fs.readFileSync(path.join(__dirname, cfg), 'utf8'), 'utf8')
    }
  return YAML.parse(fs.readFileSync(cfg, 'utf8'))
}

/**
 * Формирование служебных данных маршрутизации
 * @param req объект запроса
 * @returns {object|null}
 */
function configureObj(req) {
  let forward
  try {
    forward = new URL(req.url)
  } catch {
    forward = new URL(`${req.connection.encrypted ? 'https' : 'http'}://${path.join(req.headers?.host, req.url)}`)
  }
  req.url = req.url.replace(forward.origin, '')

  const routingRule = routingRules[forward?.hostname] || routingRules['any']
  const opts = routingRule?.match(req)

  req.foramina = {
    $name: routingRule?.name,
    $ip:
      (req.headers?.['x-forwarded-for'] || '').split(',').pop() ||
      req?.connection?.remoteAddress ||
      req?.socket?.remoteAddress ||
      req?.connection?.socket?.remoteAddress,
    $statusCode: null,
    $statusMessage: 'MISSING',
    $method: req.method,
    $forward: forward,
    $target: opts?.target ? new URL(path.join(opts.target, req.url)) : null
  }
  return opts || null
}

/**
 * Форматирование строки журнала логирования
 * @param obj
 * @returns {string}
 */
function format(obj) {
  let str = logs.format
  str = str.replace('$name', obj.$name || '-')
  str = str.replace('$ip', obj.$ip || '-')
  str = str.replace('$statusCode', obj.$statusCode || '-')
  str = str.replace('$statusMessage', obj.$statusMessage || '-')
  str = str.replace('$method', obj.$method || '-')

  str = str.replace('$forward_href', obj.$forward?.href || '-')
  str = str.replace('$forward_origin', obj.$forward?.origin || '-')
  str = str.replace('$forward_host', obj.$forward?.host || '-')
  str = str.replace('$forward_pathname', obj.$forward?.pathname || '-')

  str = str.replace('$target_href', obj.$target?.href || '-')
  str = str.replace('$target_origin', obj.$target?.origin || '-')
  str = str.replace('$target_host', obj.$target?.host || '-')
  str = str.replace('$target_pathname', obj.$target?.pathname || '-')
  return str
}
