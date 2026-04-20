# Task3.1 - OpenTelemetry и Jaeger

Этот MVP разворачивает два сервиса на `Node.js + TypeScript`:

- `service-a` принимает `GET /`, вызывает `service-b` и возвращает агрегированный ответ;
- `service-b` принимает `GET /` и возвращает простой JSON;
- оба сервиса экспортируют трейсы в `Jaeger` по `OTLP HTTP`;
- вызов `service-a -> service-b` должен попадать в один trace.

## Структура

- `Task3/k8s/jaeger-instance.yaml` - инстанс `Jaeger`
- `Task3/k8s/services.yaml` - деплой `service-a` и `service-b`
- `Task3/services/service-a` - исходники и Dockerfile первого сервиса
- `Task3/services/service-b` - исходники и Dockerfile второго сервиса

## Требования

- любой запущенный Docker-совместимый runtime (`Docker Desktop`, `Colima`, `Rancher Desktop` или аналог)
- `minikube`
- `kubectl`

## Запуск

### 1. Убедиться, что Docker runtime запущен

На macOS это может быть, например, `Docker Desktop` или `Colima`.

Пример для `Colima`:

```bash
colima start
```

### 2. Запустить Minikube

```bash
minikube start --driver=docker --addons=ingress
```

### 3. Установить cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.3/cert-manager.yaml
```

### 4. Развернуть Jaeger

```bash
kubectl create namespace observability
kubectl create -f https://github.com/jaegertracing/jaeger-operator/releases/download/v1.51.0/jaeger-operator.yaml -n observability
kubectl wait --for=condition=available deployment/jaeger-operator -n observability --timeout=180s
kubectl apply -f Task3/k8s/jaeger-instance.yaml -n observability
kubectl wait --for=condition=available deployment/simplest -n observability --timeout=180s
```

### 5. Собрать образы внутри Minikube

```bash
minikube image build -t service-a:latest Task3/services/service-a
minikube image build -t service-b:latest Task3/services/service-b
```

### 6. Развернуть сервисы

```bash
kubectl apply -f Task3/k8s/services.yaml
```

### 7. Проверить поды

```bash
kubectl get pods
kubectl get svc
```

### 8. Выполнить тестовый вызов

```bash
kubectl exec -it $(kubectl get pods -l app=service-a -o jsonpath='{.items[0].metadata.name}') -- wget -qO- http://service-a:8080
```

Ожидаемый ответ содержит поля `service`, `downstream` и `timestamp`.

### 9. Открыть Jaeger UI

```bash
kubectl port-forward svc/simplest-query 16686:16686 -n observability
```

После этого `Jaeger UI` будет доступен по адресу [http://localhost:16686](http://localhost:16686).

В интерфейсе нужно выбрать сервис `service-a` или `service-b`, найти свежий trace и убедиться, что в нём есть оба сервиса.

## Что проверять в trace

- один trace содержит server span `service-a`;
- внутри него есть client span HTTP-вызова;
- trace продолжается в `service-b` как server span;
- оба сервиса отображаются в `Jaeger`.

## Результат

Скриншот подтверждённого trace: [trace_jaeger.png](trace_jaeger.png)

Trace `2c32104` — `Services: 2`, `Total Spans: 4`, `Depth: 4`:

Структура содержит четыре span-а ,потому что в `service-a` одновременно используются:

- явный ручной span для бизнес-шагa вызова downstream-сервиса;
- auto-instrumentation исходящего HTTP-вызова.

trace выглядит так:

```
service-a  GET               (root server span)
  service-a  call-service-b  (manual internal span for downstream call)
    service-a  GET           (outgoing HTTP client span, auto-instrumented)
      service-b  GET /       (server span, linked via traceparent)
```
