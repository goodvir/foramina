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
})

// Работа с файловой системой
const fs = require('fs')
const path = require('path')
// TODO const {tmpdir} = require('os')

// Парсинг файла конфигурации
const YAML = require('yaml')

// Проксирование запросов
const http = require('http')
const httpProxy = require('http-proxy')
const HttpProxyRules = require('http-proxy-rules')

// Работа с туннелями NGROK
const ngrok = require('ngrok')

// Загрузка конфигурации
const config = getConfig()

// Настройка логирования
const logs = {
  format: '$name $ip $code $msg $method $host$url $target',
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

// Экземпляр прокси
const proxy = new httpProxy['createProxyServer']()

// Логирование запросов прокси
proxy.on('proxyRes', function (proxyRes, req) {
  const obj = {
    $name: routingRules[req?.headers?.host]?.name,
    $ip: req?.headers?.['x-forwarded-for'],
    $code: proxyRes?.statusCode,
    $msg: proxyRes?.statusMessage,
    $method: req?.method,
    $host: req?.headers?.host,
    $url: req?.url,
    $target: routingRules[req?.headers?.host]?.match(req)?.['target']
  }
  const msg = format(obj)
  if (obj.$code >= 500) log.error(msg)
  else if (obj.$code >= 400) log.warn(msg)
  else if (obj.$code >= 300) log.trace(msg)
  else log.info(msg)
})

// Логирование ошибок прокси
proxy.on('error', function (e, req, res) {
  log.error(
    format({
      $name: routingRules[req?.headers?.host]?.name,
      $ip: req?.headers?.['x-forwarded-for'],
      $msg: e.message,
      $method: req?.method,
      $host: req?.headers?.host,
      $url: req?.url,
      $target: routingRules[req?.headers?.host]?.match(req)?.['target']
    })
  )
  if (res) {
    res.writeHead(444)
    res.end()
  }
})

// Обработка входящих запросов
const server = http.createServer((req, res) => {
  req.foramina = {} // TODO
  const opts = routingRules[req?.headers?.host]?.match(req)
  if (opts) proxy.web(req, res, opts)
  else {
    log.error(
      format({
        $name: routingRules[req?.headers?.host]?.name,
        $ip: req?.headers?.['x-forwarded-for'],
        $msg: 'MISSING',
        $method: req?.method,
        $host: req?.headers?.host,
        $url: req?.url
      })
    )
    res.writeHead(444)
    res.end()
  }
})

// Поддержка протокола websocket
server.on('upgrade', (req, socket, head) => {
  const opts = routingRules[req?.headers?.host]?.match(req)
  if (opts) {
    log.info(
      format({
        $name: routingRules[req?.headers?.host]?.name,
        $ip: req?.headers?.['x-forwarded-for'],
        $msg: 'UPGRADE',
        $method: req?.method,
        $host: req?.headers?.host,
        $url: req?.url
      })
    )
    proxy.ws(req, socket, head, opts)
  }
})

// Запуск приложения
;(async () => {
  // Формирование правил маршрутизации
  for (const route of config['routing']) {
    if (!route['active']) continue
    routingRules[route['forward']] = {
      name: route['name'],
      proxy: Object.assign({}, config['proxy'] || {}, route['opts'] || {}),
      rules: new HttpProxyRules(typeof route['target'] === 'string' ? {default: route['target']} : route['target']),
      match(req) {
        const target = this.rules.match(req)
        if (target) return Object.assign({}, this.proxy, {target})
        return null
      }
    }

    // Запуск туннеля NGROK
    if (route['tunnel'] === true || (route['tunnel'] && route?.['tunnel']?.['active'] !== false)) {
      try {
        const addr = config['port'] || 3000
        const cfg = Object.assign({}, config['ngrok'] || {}, route?.['tunnel']?.['opts'] || {}, {addr})
        const url = await ngrok['connect'](cfg)
        routingRules[url.split('//')[1]] = routingRules[route['forward']]
        log.info(`Created tunnel ${url} to ${route['name'] || ''} ${route['forward']}`)
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
  server.listen(config['port'] || 3000, config['host'] || '127.0.0.1')
  // noinspection HttpUrlsUsage
  log.info(`Server listening at http://${config['host'] || '127.0.0.1'}:${config['port'] || 3000}`)
})()

/**
 * Загрузка конфигурации
 * Если файл отсутствует используется example
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
 * Форматирование строки журнала логирования
 * @param obj
 * @returns {string}
 */
function format(obj) {
  let str = logs.format
  str = str.replace('$name', obj['$name'] || '-')
  str = str.replace('$ip', obj['$ip'] || '-')
  str = str.replace('$code', obj['$code'] || '-')
  str = str.replace('$msg', obj['$msg'] || '-')
  str = str.replace('$method', obj['$method'] || '-')
  str = str.replace('$host', obj['$host'] || '-')
  str = str.replace('$url', obj['$url'] || '/')
  str = str.replace('$target', obj['$target'] || '-')
  return str
}
