import { afterEach, describe, expect, it, vi } from "vitest";
import { compressPhoto, dimensions } from "./photos";
afterEach(() => vi.unstubAllGlobals());
describe("Project photo compression", () => {
  it("fits portrait and landscape photos to 2000 pixels without enlarging small photos", () => {
    expect(dimensions(6000, 4000)).toEqual({ width: 2000, height: 1333 });
    expect(dimensions(3000, 6000)).toEqual({ width: 1000, height: 2000 });
    expect(dimensions(600, 360)).toEqual({ width: 600, height: 360 });
  });
  it("re-encodes the image, strips source metadata, hashes output and closes the bitmap", async () => {
    const bitmap = { width: 4000, height: 3000, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        fillStyle: "",
      }),
      toBlob: (fn: (blob: Blob) => void, type: string) =>
        fn(new Blob(["resized photo"], { type })),
    };
    vi.stubGlobal("document", { createElement: () => canvas });
    const result = await compressPhoto(
      new File(["original GPS metadata"], "site.jpg", { type: "image/jpeg" }),
    );
    expect(result.width).toBe(2000);
    expect(result.height).toBe(1500);
    expect(result.blob.type).toBe("image/webp");
    expect(await result.blob.text()).toBe("resized photo");
    expect(result.sha256).toHaveLength(64);
    expect(bitmap.close).toHaveBeenCalled();
  });
  it("rejects documents and excessive source sizes before decoding", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    await expect(
      compressPhoto(new File(["pdf"], "x.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("Choose a JPEG");
    const file = new File(["x"], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 40_000_001 });
    await expect(compressPhoto(file)).rejects.toThrow("40 MB");
    expect(decode).not.toHaveBeenCalled();
  });
});
