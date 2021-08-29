'use strict'

// Интерфейс ввода
const readline = require('readline')
const readlineInterface = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

// Необработанные ошибки
process.on('uncaughtException', (err) => {
  console.error(err)
  if (process['pkg']) readlineInterface.on('line', () => process.exit(1))
  else process.exit(1)
})

// Работа c системой
const os = require('os')
const fs = require('fs')
const path = require('path')
// TODO const {tmpdir} = require('os')

// Парсинг файла конфигурации
const YAML = require('yaml')

// Проксирование запросов
const {URL} = require('url')
const http = require('http')
const httpProxy = require('http-proxy')
const HttpProxyRules = require('http-proxy-rules')

// Работа с туннелями NGROK
const ngrok = require('ngrok')

// Загрузка конфигурации
const config = getConfig()

// Настройка логирования
const logs = {
  format: '$name $ip $statusCode $statusMessage $method $forward_href $target_href',
  file: false
}
if (typeof config['logs'] === 'string') logs.format = config['logs']
if (config?.['logs']?.['format']) logs.format = config['logs']['format']
if (config?.['logs']?.['file']) {
  logs.file = `./foramina.log`
  fs.appendFileSync(logs.file, `Run script ${new Date().toISOString()}\n`, 'utf8')
}

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

// Правила маршрутизации
const routingRules = {}

// Экземпляр сервера
const server = http.createServer()

// Экземпляр прокси
const proxy = new httpProxy['createProxyServer']()

// Логирование запросов прокси
proxy.on('proxyRes', function (proxyRes, req) {
  req.foramina.$statusCode = proxyRes?.statusCode
  req.foramina.$statusMessage = proxyRes?.statusMessage
  const msg = format(req.foramina)
  if (req.foramina.$statusCode >= 500) log.error(msg)
  else if (req.foramina.$statusCode >= 400) log.warn(msg)
  else if (req.foramina.$statusCode >= 300) log.trace(msg)
  else log.info(msg)
})

// Логирование ошибок прокси
proxy.on('error', function (e, req, res) {
  req.foramina.$statusMessage = e.message
  log.error(format(req.foramina))
  if (res) {
    res.writeHead(444)
    res.end()
  }
})

// Обработка входящих запросов
server.on('request', (req, res) => {
  const opts = configureObj(req)
  if (opts) proxy.web(req, res, opts)
  else {
    log.error(format(req.foramina))
    res.writeHead(444)
    res.end()
  }
})

// Поддержка протокола websocket
server.on('upgrade', (req, socket, head) => {
  const opts = configureObj(req)
  req.foramina.$statusMessage = 'UPGRADE'
  if (opts) {
    log.info(format(req.foramina))
    proxy.ws(req, socket, head, opts)
  } else socket.destroy()
})

// Инициализация
;(async () => {
  const [host, port, urls] = getListening(config['host'], config['port'])

  // Формирование правил маршрутизации
  for (const route of config['routing']) {
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
    if (route['forward'] === 'default') urls.forEach((url) => (routingRules[url.host] = routingRule))
    else routingRules[route['forward']] = routingRule

    // Запуск туннеля NGROK
    if (route['tunnel'] === true || (route['tunnel'] && route?.['tunnel']?.['active'] !== false)) {
      try {
        const addr = `${host}:${port}`
        const cfg = Object.assign({}, config['ngrok'] || {}, route?.['tunnel']?.['opts'] || {}, {addr})
        const url = new URL(await ngrok['connect'](cfg))
        routingRules[url.host] = routingRule
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
  server.listen(port, host)
  urls.forEach((url) => log.info(`Server listening at ${url.href}`))
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
  const host = req.headers?.host
  const url = req.url
  const routingRule = routingRules[host]
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
    $forward: host ? new URL(url, `${req.headers?.['x-forwarded-proto'] || 'http'}://${host}`) : null,
    $target: opts?.target ? new URL(req.url, opts.target) : null
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
  str = str.replace('$forward_pathname', obj.$forward?.pathname || '-')
  str = str.replace('$target_href', obj.$target?.href || '-')
  str = str.replace('$target_pathname', obj.$target?.pathname || '-')
  return str
}

/**
 * Формирование URL сервера
 * @param host интерфейс, который будет прослушивать сервер
 * @param port порт, который будет прослушивать сервер
 * @returns {*[]}
 */
function getListening(host, port) {
  const protocol = 'http'
  host = config['host'] === 'localhost' ? '127.0.0.1' : config['host'] || '127.0.0.1'
  port = config['port'] || 3000

  const urls = []
  switch (host) {
    case '127.0.0.1':
      urls.push(new URL(`${protocol}://localhost:${port}`))
      urls.push(new URL(`${protocol}://127.0.0.1:${port}`))
      break
    case '0.0.0.0':
      urls.push(new URL(`${protocol}://localhost:${port}`))
      urls.push(new URL(`${protocol}://127.0.0.1:${port}`))
      try {
        Object.entries(os.networkInterfaces()).forEach(([, interfaces]) => {
          interfaces.forEach((face) => {
            if ('IPv4' !== face.family || face.internal !== false) return
            urls.push(new URL(`${protocol}://${face.address}:${port}`))
          })
        })
      } catch {}
      break
    default:
      urls.push(new URL(`${protocol}://${host}:${port}`))
  }

  return [host, port, urls]
}
