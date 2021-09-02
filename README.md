<!--suppress ALL -->

# FORAMINA

## Когда нужно прокинуть ваш сервис в интернет

`foramina` представляет собой настраиваемый прокси сервер с интеграцией [ngrok](https://ngrok.com),
поддержкой `websocket` и возможностью определять набор правил для преобразования совпадающих маршрутов в целевые, с
которыми прокси будет разговаривать от имени клиента.

В процессе разработки бывают ситуации, когда вам необходимо показать результат другому человеку. Самое первое, что
приходит на ум — это купить дешевый хост и развернуть там, но это дополнительные затраты денег и времени. Другой пример
— когда вы делаете свой локальный проект и вам нужно получать запросы от внешних сервисов.

Для данных случаев вы можете воспользоваться сервисами создания туннелей. Одним из популярных сервисов для построения
туннелей до вашего компьютера является [ngrok](https://ngrok.com). Он безумно простой и одновременно функциональный в
бесплатной версии.

Но бывают ситуации когда необходимо настроить правила переадресации, либо объединить работу внутренних сервисов компании
и локального проекта для демонстрации заказчику. Возможно вам так же необходимо отладить мобильное приложение которому
необходим доступ к закрытому API. В таких ситуациях незаменимым помощником будет `foramina`.

## Как работать с `foramina`

### Упакованный скрипт без зависимостей

- скачать [последний релиз](https://github.com/goodvir/foramina/releases/latest)
- удостовериться, что ваши локальные сервисы запущены и ожидают HTTP запросов
- настроить [файл конфигурации](#настройка-конфигурации) `foramina`
- запустить [исполняемый файл](#исполняемые-файлы)

### Сборка из исходного кода

- [клонировать репозиторий](https://github.com/goodvir/foramina.git)
  или [скачать архив](https://github.com/goodvir/foramina/archive/refs/heads/master.zip)
- установить зависимости `npm i`
- настроить [файл конфигурации](#настройка-конфигурации) `foramina`
- выполнить необходимую команду:
  - `npm run dev` - запуск в режиме разработки
  - `npm run start` - запуск в стандартном режиме
  - `npm run build` - [компиляция исполняемых файлов](#компиляция-исполняемых-файлов)

## Настройка конфигурации

Во время запуска скрипт проверяет наличие файла конфигурации `./config.yml`, если он отсутствует, создает новый с
шаблоном настроек.

Различные варианты конфигурации можно посмотреть в разделе с [примерами](#примеры-конфигурации).

По умолчанию для всех запросов которые не попадают под правила маршрутизации сервер генерирует пустой ответ с HTTP
кодом `444`, это поведение можно изменить на режим обратного прокси, установив параметр `revers: true`.

### Поддерживаемые параметры

- `host` _string_: интерфейс, который будет прослушивать сервер, по умолчанию прослушивается только _127.0.0.1_
  интерфейс _localhost_, чтобы прослушивать все доступные интерфейсы IPv4, следует указать _0.0.0.0_
- `port` _number_: порт, который будет прослушивать сервер, _default: 3000_
- `revers` _boolean_: режим обратного прокси, _default: false_
- `logs` _string|object_: [формат строки журнала](#логирование) логирования, либо объект с расширенными параметрами
  - `format` _string_: [формат строки журнала](#логирование) логирования
  - `file` _boolean_: флаг дублирования журнала логирования в файл _./foramina.log_
- `proxy` _object_: объект с параметрами доступными
  для [node-http-proxy](https://github.com/http-party/node-http-proxy#options), данные параметры применяются для всех
  соединений
- `ngrok` _object_: объект с параметрами доступными для [ngrok](https://github.com/bubenshchykov/ngrok#options), данные
  параметры применяются для всех созданных туннелей
- `routing` _array_: список данных для маршрутизации входящих соединений и создания туннелей
  - `active` _boolean_: флаг использования данных при формировании правил маршрутизации
  - `name` _string_: псевдоним настроек для отображения в журнале логирования
  - `opts` _object_: объект с параметрами доступными
    для [node-http-proxy](https://github.com/http-party/node-http-proxy#options), данные параметры применяются для
    текущего правила маршрутизации
  - `forward` _string|array_: имя хоста (либо список имен) для привязки правил маршрутизации, например _app.ru_, так же
    допустимо использовать _any_ для настройки правил по умолчанию
  - `target` _string|object_: целевой URL для перенаправления, например _https://github.com_, так же возможно указать
    объект с параметрами доступными для [http-proxy-rules](https://github.com/donasaur/http-proxy-rules#options),
    смотрите [доступные примеры](https://github.com/donasaur/http-proxy-rules/blob/master/test/index.tests.js#L33)
  - `tunnel` _boolean|object_: параметры туннеля [ngrok](https://ngrok.com) возможно указывать _true/false_
    - `active` _boolean_: флаг необходимости создания туннеля
    - `opts` _object_: объект с параметрами доступными для [ngrok](https://github.com/bubenshchykov/ngrok#options)

### Примеры конфигурации

**Проксирование всех запросов `http://127.0.0.1:3000` на `http://127.0.0.1:8080`**

```yaml
routing:
  - active: true
    name: DEFAULT
    forward: any # Применять правила для всех запросов
    target: http://127.0.0.1:8080
```

```text
Server listening at http://localhost:3000/
Server listening at http://127.0.0.1:3000/
DEFAULT 127.0.0.1 200 OK GET http://127.0.0.1:3000/ http://127.0.0.1:8080/
DEFAULT 127.0.0.1 200 OK GET http://localhost:3000/ http://127.0.0.1:8080/
DEFAULT 127.0.0.1 404 Not Found GET http://127.0.0.1:3000/test http://127.0.0.1:8080/test
DEFAULT 127.0.0.1 404 Not Found GET http://localhost:3000/test http://127.0.0.1:8080/test
```

**Использование правил маршрутизации и дополнительных настроек сервера**

```yaml
proxy:
  secure: false # Отключить проверку SSL
routing:
  - active: true
    name: DEFAULT
    forward: any
    target:
      default: http://127.0.0.1:8080
      rules:
        # Перенаправить /anything на внешний сервис https://httpbin.org
        "/anything": https://httpbin.org/anything
```

```text
DEFAULT 127.0.0.1 200 OK GET http://127.0.0.1:3000/ http://127.0.0.1:8080/
DEFAULT 127.0.0.1 200 OK GET http://127.0.0.1:3000/anything https://httpbin.org/anything
```

**Прослушивание всех доступных интерфейсов `IPv4` на `9000` порту**

```yaml
host: 0.0.0.0
port: 9000
routing:
  - active: true
    name: DEFAULT
    forward: any # Применять правило для всех запросов
    target: http://127.0.0.1:8080
```

```text
Server listening at http://localhost:9000/
Server listening at http://127.0.0.1:9000/
Server listening at http://192.168.155.209:9000/
DEFAULT 127.0.0.1 200 OK GET http://localhost:9000/ http://127.0.0.1:8080/
DEFAULT 127.0.0.1 200 OK GET http://localhost:9000/favicon.ico http://127.0.0.1:8080/favicon.ico
DEFAULT 127.0.0.1 200 OK GET http://127.0.0.1:9000/ http://127.0.0.1:8080/
DEFAULT 192.168.155.209 200 OK GET http://192.168.155.209:9000/ http://127.0.0.1:8080/
DEFAULT 192.168.155.209 200 OK GET http://192.168.155.209:9000/favicon.ico http://127.0.0.1:8080/favicon.ico
```

**Использование совместно с браузером [Firefox](https://www.mozilla.org/ru)**

Необходимо настроить [параметры соединения браузера](https://support.mozilla.org/ru/kb/parametry-soedineniya-v-firefox)
на работу с прокси сервером:

<p>
<img src="docs/firefox.jpg" width="500" height="auto" alt="firefox preferences">
</p>

```yaml
TODO
```

### Логирование

TODO

## Исполняемые файлы

TODO

### Компиляция исполняемых файлов

TODO

## Как это работает?

- [node-http-proxy](https://github.com/http-party/node-http-proxy#readme)
- [http-proxy-rules](https://github.com/donasaur/http-proxy-rules#readme)
- [ngrok](https://github.com/bubenshchykov/ngrok#readme)
- [YAML](https://github.com/eemeli/yaml#readme)
- [pkg](https://github.com/vercel/pkg#readme)
