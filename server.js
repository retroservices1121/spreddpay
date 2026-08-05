const http = require("http");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT) || 3000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8"
};

function safePath(urlPath) {
  const requested = decodeURIComponent((urlPath || "/").split("?")[0]);
  const normalized = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const relative = normalized === "/" ? "index.html" : normalized.replace(/^[/\\]/, "");
  const fullPath = path.join(publicDir, relative);
  return fullPath.startsWith(publicDir) ? fullPath : null;
}

const server = http.createServer((req, res) => {
  const filePath = safePath(req.url);

  if (!filePath) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    let resolvedPath = filePath;

    if (!statError && stats.isDirectory()) {
      resolvedPath = path.join(filePath, "index.html");
    }

    fs.readFile(resolvedPath, (error, data) => {
      if (error) {
        fs.readFile(path.join(publicDir, "index.html"), (fallbackError, fallback) => {
          if (fallbackError) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Not found");
            return;
          }
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache"
          });
          res.end(fallback);
        });
        return;
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      const isHtml = ext === ".html";
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": isHtml ? "no-cache" : "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
      });
      res.end(data);
    });
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`SpreddPay is running on port ${port}`);
});
