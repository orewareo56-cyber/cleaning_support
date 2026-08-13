import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("GitHub Pages用ビルドは相対アセット参照だけを使う", async () => {
  const html = await readFile(new URL("dist/index.html", root), "utf8");
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /href="\.\/manifest\.webmanifest"/);
  assert.match(html, /src="\.\/assets\//);
  assert.doesNotMatch(html, /(?:src|href)="\/(?:assets|manifest|icon)/);
});

test("PWAマニフェストはインストールに必要な項目とPNGアイコンを持つ", async () => {
  const manifest = JSON.parse(await readFile(new URL("dist/manifest.webmanifest", root), "utf8"));
  assert.equal(manifest.name, "片付けの一歩");
  assert.equal(manifest.id, "./");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose.includes("maskable")));
  await Promise.all([
    access(new URL("dist/icon-192.png", root)),
    access(new URL("dist/icon-512.png", root)),
    access(new URL("dist/apple-touch-icon.png", root)),
    access(new URL("dist/sw.js", root)),
  ]);
});

test("Service Workerは同一originだけをキャッシュしナビゲーションをオフライン復旧する", async () => {
  const worker = await readFile(new URL("dist/sw.js", root), "utf8");
  assert.match(worker, /requestUrl\.origin !== self\.location\.origin/);
  assert.match(worker, /event\.request\.mode === "navigate"/);
  assert.match(worker, /manifest\.webmanifest/);
  assert.match(worker, /icon-192\.png/);
});

test("狭いiPhone幅でもカレンダーの日付は44pxの操作領域を保つ", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /grid-template-columns:\s*repeat\(7, minmax\(44px, 1fr\)\)/);
  assert.match(css, /\.calendar-day\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*48px;/s);
  assert.match(css, /@media \(max-width:\s*380px\)[\s\S]*\.calendar-card\s*\{[^}]*width:\s*calc\(100% \+ 28px\)/);
  assert.match(css, /@media \(max-width:\s*380px\)[\s\S]*\.calendar-day\s*\{[^}]*min-height:\s*44px;/);
});
