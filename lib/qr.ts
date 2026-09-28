export type QRPayload = {
  v: 1;
  event: string;
  title?: string;
  start?: string;
  end?: string;
};

export type ParseQRResult =
  | { ok: true; payload: QRPayload }
  | { ok: false; message: string };

export function buildQRPayload(event: {
  eventId: string;
  title?: string;
  start?: string;
  end?: string;
}): string {
  const payload: QRPayload = {
    v: 1,
    event: event.eventId,
  };

  if (event.title) payload.title = event.title;
  if (event.start) payload.start = event.start;
  if (event.end) payload.end = event.end;

  return JSON.stringify(payload);
}

export function parseQRPayload(raw: string): ParseQRResult {
  try {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return { ok: false, message: "Invalid QR code." };
    }

    if (parsed.v !== 1) {
      return { ok: false, message: "Not an attendance QR code." };
    }

    if (typeof parsed.event !== "string" || !parsed.event.trim()) {
      return { ok: false, message: "Not an attendance QR code." };
    }

    const payload: QRPayload = {
      v: 1,
      event: parsed.event,
      ...(typeof parsed.title === "string" ? { title: parsed.title } : {}),
      ...(typeof parsed.start === "string" ? { start: parsed.start } : {}),
      ...(typeof parsed.end === "string" ? { end: parsed.end } : {}),
    };

    return { ok: true, payload };
  } catch {
    return { ok: false, message: "Invalid QR code." };
  }
}
