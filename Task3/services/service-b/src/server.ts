import { createServer, IncomingMessage } from "http";
import {
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  trace,
} from "@opentelemetry/api";

const port = Number(process.env.PORT ?? "8080");
const tracer = trace.getTracer("service-b");

function extractContext(req: IncomingMessage) {
  const carrier: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") carrier[key] = value;
    else if (Array.isArray(value)) carrier[key] = value.join(",");
  }
  return propagation.extract(context.active(), carrier);
}

const server = createServer((req, res) => {
  const parentCtx = extractContext(req);

  tracer.startActiveSpan(
    "GET /",
    { kind: SpanKind.SERVER },
    parentCtx,
    (span) => {
      try {
        if (req.method !== "GET" || req.url !== "/") {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "not_found" }));
          span.setStatus({ code: SpanStatusCode.ERROR, message: "not_found" });
          return;
        }

        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            service: "service-b",
            message: "hello from service-b",
            timestamp: new Date().toISOString(),
          }),
        );
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    },
  );
});

server.listen(port, () => {
  console.log(`service-b listening on port ${port}`);
});
