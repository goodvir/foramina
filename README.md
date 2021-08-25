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

- скачать архив с [последним релизом]()
- удостовериться, что ваши локальные сервисы запущены и ожидают HTTP запросов
- настроить [файл конфигурации]() `foramina`
- запустить [исполняемый файл]() для вашей операционной системы

### Сборка из исходного кода

- [клонировать репозиторий](https://github.com/goodvir/foramina.git)
  либо [скачать архив](https://github.com/goodvir/foramina/archive/refs/heads/master.zip)
- установить зависимости `npm i`
- настроить [файл конфигурации]() `foramina`
- выполнить необходимую команду:
  - `npm run dev` - запуск в режиме разработки
  - `npm run start` - запуск в стандартном режиме
  - `npm run build` - [компиляция исполняемых файлов]()

## Настройка конфигурации

Во время запуска скрипт проверяет наличие файла конфигурации `./config.yml`, если он отсутствует, создает новый с
шаблоном настроек.

Различные варианты конфигурации можно посмотреть в разделе с [примерами]().

Для всех запросов которые не попадают под правила маршрутизации сервер генерирует пустой ответ с HTTP кодом `444`.

### Поддерживаемые параметры

- `host` _string_: интерфейс, который будет прослушивать сервер, по умолчанию прослушивается только _127.0.0.1_
  интерфейс _localhost_, чтобы прослушивать все доступные интерфейсы IPv4, следует указать _0.0.0.0_, _default:
  127.0.0.1_
- `port` _number_: порт, который будет прослушивать сервер, _default: 3000_
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
  - `forward` _string_: имя домена для привязки правил маршрутизации, например _127.0.0.1:3000_, имя домена сервер
    определяет по заголовку ["Host"](https://developer.mozilla.org/ru/docs/Web/HTTP/Headers/Host)
  - `target` _string|object_: целевой URL для перенаправления, например _https://github.com_, так же возможно указать
    объект с параметрами доступными для [http-proxy-rules](https://github.com/donasaur/http-proxy-rules#options),
    смотрите [доступные примеры](https://github.com/donasaur/http-proxy-rules/blob/master/test/index.tests.js#L33)
  - `tunnel` _boolean|object_: параметры туннеля [ngrok](https://ngrok.com) возможно указывать _true/false_
    - `active` _boolean_: флаг необходимости создания туннеля
    - `opts` _object_: объект с параметрами доступными для [ngrok](https://github.com/bubenshchykov/ngrok#options)

### Примеры конфигурации

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