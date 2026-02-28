type SheetUpdateMessage = {
  type: "sheetUpdated";
  patientId: number;
  sheetType: string;
};

type WsOptions = {
  patientId: number;
  onUpdate: (message: SheetUpdateMessage) => void;
};

export function connectSheetUpdates({ patientId, onUpdate }: WsOptions) {
  if (!patientId || typeof window === "undefined") return null;
  // Production hardening: disable WS sheet sync outside local development.
  // Repeated WS failures can flood the browser event loop and make UI controls unresponsive.
  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (!isLocal) return null;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${window.location.host}/ws`;
  const socket = new WebSocket(url);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "subscribe", patientId }));
  });

  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data) as SheetUpdateMessage;
      if (message.type === "sheetUpdated" && message.patientId === patientId) {
        onUpdate(message);
      }
    } catch {
      // ignore malformed messages
    }
  });

  return socket;
}
