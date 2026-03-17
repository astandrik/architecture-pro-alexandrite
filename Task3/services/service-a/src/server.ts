import { createServer } from "http";
import {
  SpanStatusCode,
  context,
  trace,
} from "@opentelemetry/api";

const port = Number(process.env.PORT ?? "8080");
const downstreamUrl = new URL(process.env.DOWNSTREAM_URL ?? "http://localhost:8081");
const tracer = trace.getTracer("service-a");

async function callDownstream(): Promise<unknown> {
  return tracer.startActiveSpan("call-service-b", async (span) => {
    const spanContext = trace.setSpan(context.active(), span);

    try {
      const response = await context.with(spanContext, () =>
        fetch(downstreamUrl, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        }),
      );

      if (!response.ok) {
        throw new Error(`service-b returned ${response.status}: ${await response.text()}`);
      }

      const body = (await response.json()) as unknown;
      span.setAttribute("http.downstream.status_code", response.status);
      span.setStatus({ code: SpanStatusCode.OK });
      return body;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "unknown error",
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

const server = createServer(async (req, res) => {
  if (req.method !== "GET" || req.url !== "/") {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  try {
    const downstream = await callDownstream();

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        service: "service-a",
        downstream,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error: "downstream_request_failed",
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
  }
});

server.listen(port, () => {
  console.log(`service-a listening on port ${port}`);
});
