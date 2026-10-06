/**
 * Image upload endpoint.
 *
 * A Route Handler rather than a Server Action because it receives a binary
 * multipart body and returns a URL the client needs immediately.
 *
 * Authorization is NOT inherited from whatever page called this - a route
 * handler is its own entry point, so it does its own check first.
 */
import { ForbiddenError, requireSeller, UnauthenticatedError } from "@/lib/data/auth";
import { MAX_UPLOAD_BYTES, storeImageUpload, UploadError } from "@/lib/upload";

export async function POST(request: Request) {
  try {
    // Only a seller may upload, and only after verifying their email.
    await requireSeller();

    // Reject an oversized body before reading it into memory, when the client
    // was honest enough to declare a length.
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_UPLOAD_BYTES * 1.1) {
      return Response.json({ error: "That file is too large." }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const prefix = String(formData.get("prefix") ?? "products");

    if (!(file instanceof File)) {
      return Response.json({ error: "No file was sent." }, { status: 400 });
    }

    const stored = await storeImageUpload(file, prefix);

    return Response.json({ url: stored.url, kind: stored.kind, bytes: stored.bytes });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof UploadError) {
      // Safe to show: these messages describe the file, not our internals.
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error("[upload] failed", error);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
