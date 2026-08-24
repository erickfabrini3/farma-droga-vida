import { contentTypeForKey, getProductImage } from "@/app/product-images";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key)) {
    return new Response("Imagem inválida", { status: 400 });
  }

  try {
    const image = await getProductImage(key);
    if (!image) return new Response("Imagem não encontrada", { status: 404 });

    return new Response(image.body, {
      headers: {
        "Content-Type": contentTypeForKey(key),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Imagem indisponível", { status: 503 });
  }
}
