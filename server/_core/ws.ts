import type { IncomingMessage, Server } from "http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { parse as parseCookieHeader } from "cookie";
import { authService, AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME } from "./auth";

type WsClient = WebSocket & { subscriptions?: Set<number> };

let wss: WebSocketServer | null = null;

export function registerWsServer(server: Server) {
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (!req.url || !req.url.startsWith("/ws")) {
      return;
    }
    wss?.handleUpgrade(req, socket, head, (ws) => {
      wss?.emit("connection", ws, req);
    });
  });

  wss.on("connection", async (socket: WsClient, req: IncomingMessage) => {
    const cookies = parseCookieHeader(req.headers.cookie || "");
    const token = cookies[AUTH_COOKIE_NAME] || cookies[LEGACY_AUTH_COOKIE_NAME];
    const session = await authService.verifySession(token);
    if (!session) {
      socket.close(1008, "Unauthorized");
      return;
    }

    socket.subscriptions = new Set<number>();

    socket.on("message", (raw: RawData) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message?.type === "subscribe" && typeof message.patientId === "number") {
          socket.subscriptions?.add(message.patientId);
        }
      } catch {
        // ignore malformed messages
      }
    });
  });
}

export function broadcastSheetUpdate(patientId: number, sheetType: string) {
  if (!wss) return;
  const payload = JSON.stringify({
    type: "sheetUpdated",
    patientId,
    sheetType,
    at: Date.now(),
  });

  wss.clients.forEach((client) => {
    const ws = client as WsClient;
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.subscriptions?.has(patientId)) {
      ws.send(payload);
    }
  });
}
