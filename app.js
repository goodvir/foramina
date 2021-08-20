'use strict'

const fs = require('fs')
const http = require('http')
const httpProxy = require('http-proxy')
const ngrok = require('ngrok')

// Загрузка файла конфигурации
const config = JSON.parse(fs.readFileSync('./config.json').toString())

// Статус готовности
let CREATED = false

// Правила перенаправления
const proxyRules = {}

// Конфигурация прокси сервера
const proxy = new httpProxy['createProxyServer']({
  ws: true,
  xfwd: false,
  secure: false,
  changeOrigin: true,
  hostRewrite: true,
  autoRewrite: true
})

// Настройка логирования
const dt = () => new Date().toLocaleTimeString()
const createMsg = (code, project, ip, msg, url) =>
  `${code || '-'} ${project || '-'} ${ip || '-'} ${msg || '-'} ${url || '-'}`
const log = {
  trace: (msg) => console.log('\x1b[90m%s \x1b[90m%s\x1b[0m', dt(), msg),
  info: (msg) => console.log('\x1b[90m%s \x1b[32m%s\x1b[0m', dt(), msg),
  warn: (msg) => console.log('\x1b[90m%s \x1b[93m%s\x1b[0m', dt(), msg),
  error: (msg) => console.log('\x1b[90m%s \x1b[31m%s\x1b[0m', dt(), msg)
}

// Логирование ошибок
proxy.on('error', function (err, req, res) {
  const project = req?.headers?.host ? proxyRules[req.headers.host]?.name || req.headers.host : null
  const ip = req?.headers?.['x-forwarded-for'] || null
  const url = req?.method && req?.url ? `${req.method} ${req.url}` : null
  log.error(createMsg(null, project, ip, err.message, url))
  if (res) res.writeHead(444).end()
})

// Логирование запросов
proxy.on('proxyRes', function (proxyRes, req) {
  const code = proxyRes?.statusCode
  const project = req?.headers?.host ? proxyRules[req.headers.host]?.name || req.headers.host : null
  const ip = req?.headers?.['x-forwarded-for'] || null
  const url = req?.method && req?.url ? `${req.method} ${req.url}` : null
  const msg = createMsg(code, project, ip, proxyRes?.statusMessage, url)
  if (code >= 500) log.error(msg)
  else if (code >= 400) log.warn(msg)
  else if (code >= 300) log.trace(msg)
  else log.info(msg)
})

// Логика обработки запросов прокси сервера
const proxyServer = http.createServer((req, res) => {
  if (!CREATED) while (CREATED) {}
  if (proxyRules[req?.headers?.host]) proxy.web(req, res, {target: proxyRules[req.headers.host].target})
  else {
    const url = req?.method && req?.url ? `${req.method} ${req.url}` : null
    log.error(createMsg(null, req?.headers?.host, req?.headers?.['x-forwarded-for'], 'missing redirect rule', url))
    res.writeHead(444)
    res.end()
  }
})

// Поддержка обновления протокола websocket
proxyServer.on('upgrade', (req, socket, head) => {
  if (!CREATED) while (CREATED) {}
  if (proxyRules[req?.headers?.host]) {
    const project = req?.headers?.host ? proxyRules[req.headers.host]?.name || req.headers.host : null
    const ip = req?.headers?.['x-forwarded-for'] || null
    const url = req?.method && req?.url ? `${req.method} ${req.url}` : null
    log.info(createMsg(null, project, ip, 'upgrade', url))
    proxy.ws(req, socket, head, {target: proxyRules[req.headers.host].target})
  }
})

// Запуск прокси сервера
;(async () => {
  proxyServer.listen(config.port)
  log.info(`Server proxy initialized: http://127.0.0.1:${config.port}`)

  // Инициализация NGROK
  for (const tunnel of config.tunnels) {
    if (!tunnel.on) continue
    try {
      // noinspection JSUnusedGlobalSymbols
      const url = await ngrok['connect']({
        binPath: () => './node_modules/ngrok/bin',
        region: config.region || undefined,
        authtoken: config.authtoken || undefined,
        subdomain: config.authtoken ? tunnel.subdomain : undefined,
        proto: 'http',
        addr: `127.0.0.1:${config.port}`,
        bind_tls: true,
        inspect: false
      })
      proxyRules[url.split('//')[1]] = tunnel
      log.info(`Created tunnel ${tunnel.name} from ${url} to ${tunnel.target}`)
    } catch (err) {
      let details
      try {
        details = err.body.details.err.split('\n')[0]
      } catch {}
      log.error(`${tunnel.name} ${details || err.message}`)
    }
  }

  // Статус готовности
  CREATED = true
})()
