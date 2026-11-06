import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createAppServer } from "../server.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

test("serves the test UI, JavaScript, and CSS without external dependencies", async (t) => {
  const app = createAppServer();
  const port = await listen(app);
  t.after(() => close(app));
  const html = await fetch("http://127.0.0.1:" + port + "/");
  assert.equal(html.status, 200);
  assert.match(await html.text(), /id="auth-form"/);
  assert.match(html.headers.get("content-type"), /text\/html/);

  const script = await fetch("http://127.0.0.1:" + port + "/main.js");
  assert.equal(script.status, 200);
  assert.match(await script.text(), /createTeacherMessage/);

  const css = await fetch("http://127.0.0.1:" + port + "/styles.css");
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
});

test("proxies API POST with JSON and Bearer token unchanged", async (t) => {
  const backend = http.createServer(async (req, res) => {
    let data = "";
    for await (const part of req) data += part;
    assert.equal(req.url, "/api/auth/login");
    assert.equal(req.method, "POST");
    assert.equal(req.headers.authorization, "Bearer devtoken");
    assert.deepEqual(JSON.parse(data), { email: "student@example.com", password: "Sample123!" });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ role: "Student", accessToken: "jwtmock" }));
  });
  const backPort = await listen(backend);
  t.after(() => close(backend));
  const app = createAppServer({ apiTarget: "http://127.0.0.1:" + backPort });
  const frontPort = await listen(app);
  t.after(() => close(app));

  const response = await fetch("http://127.0.0.1:" + frontPort + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer devtoken" },
    body: JSON.stringify({ email: "student@example.com", password: "Sample123!" })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { role: "Student", accessToken: "jwtmock" });
});

test("keeps non-API requests local and returns 404 for missing assets", async (t) => {
  const app = createAppServer();
  const port = await listen(app);
  t.after(() => close(app));
  const missing = await fetch("http://127.0.0.1:" + port + "/does-not-exist");
  assert.equal(missing.status, 404);
  const method = await fetch("http://127.0.0.1:" + port + "/index.html", { method: "POST" });
  assert.equal(method.status, 405);
});
