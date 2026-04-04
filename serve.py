"""Local dev server with COOP/COEP headers for SharedArrayBuffer (multi-thread WASM)."""
import http.server

class CORSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        super().end_headers()

if __name__ == "__main__":
    print("Serving at http://localhost:8080 (with COOP/COEP for multi-thread WASM)")
    http.server.HTTPServer(("", 8080), CORSHandler).serve_forever()
