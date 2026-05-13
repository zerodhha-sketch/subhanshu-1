import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

type StoredImage = {
  data?: Buffer;
  contentType?: string;
};

function toBytes(input: unknown): Uint8Array | null {
  if (!input) return null;

  if (input instanceof Uint8Array) {
    return new Uint8Array(input);
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) {
    return new Uint8Array(input);
  }

  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;

    const asBufferShape = obj as { type?: unknown; data?: unknown };
    if (asBufferShape.type === "Buffer" && Array.isArray(asBufferShape.data)) {
      return Uint8Array.from(asBufferShape.data as number[]);
    }

    const asBinary = obj as { $binary?: unknown };
    if (asBinary.$binary && typeof asBinary.$binary === "object") {
      const b = asBinary.$binary as Record<string, unknown>;
      const base64 = b.base64;
      if (typeof base64 === "string" && typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(base64, "base64"));
      }
    }

    const maybeBuffer = obj.buffer;
    if (maybeBuffer instanceof Uint8Array) {
      return new Uint8Array(maybeBuffer);
    }
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const photo = (user as { documents?: { photo?: StoredImage } }).documents?.photo;
    if (!photo?.data || !photo.contentType) {
      return NextResponse.json({ message: "Profile photo not found" }, { status: 404 });
    }

    const bytes = toBytes(photo.data);
    if (!bytes || bytes.byteLength === 0) {
      return NextResponse.json({ message: "Profile photo invalid" }, { status: 500 });
    }

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": photo.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Auth photo error:", error);
    return NextResponse.json({ message: "Failed to load profile photo" }, { status: 500 });
  }
}
