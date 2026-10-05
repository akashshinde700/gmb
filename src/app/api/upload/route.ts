import { limitSubjectOrThrow, ok, requireUser, route, HttpError } from "@/lib/api";
import { UPLOAD_MAX_BYTES, sniffImage, storeImage } from "@/lib/uploads";

export const runtime = "nodejs";

/**
 * POST /api/upload — authenticated image upload (multipart/form-data, field "file").
 * Returns { url } pointing at GET /api/uploads/[file].
 */
export const POST = route(async (req: Request) => {
  const session = await requireUser(req);
  limitSubjectOrThrow(`upload:${session.id}`, 60, 60 * 60 * 1000);

  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError("Expected a multipart/form-data upload", 400);

  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError("No file received", 400);
  if (file.size === 0) throw new HttpError("The selected file is empty", 400);
  if (file.size > UPLOAD_MAX_BYTES) throw new HttpError("Image is too large — keep it under 4 MB", 413);

  const buffer = Buffer.from(await file.arrayBuffer());
  // Trust the bytes, not the declared type or the filename.
  const kind = sniffImage(buffer);
  if (!kind) throw new HttpError("Unsupported image type. Use JPG, PNG, WebP or GIF.", 415);

  const name = await storeImage(buffer, kind.ext);
  return ok({ url: `/api/uploads/${name}`, name, size: buffer.length, type: kind.mime }, 201);
});
