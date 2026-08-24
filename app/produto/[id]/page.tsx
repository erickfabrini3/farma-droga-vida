/* eslint-disable @next/next/no-html-link-for-pages */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicProduct } from "@/app/product-data";
import ProductDetailClient from "./product-detail-client";

export const dynamic = "force-dynamic";
const siteOrigin = "https://site-do-erick.erick-fabrini3.chatgpt.site";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await getPublicProduct(Number(id));
  if (!product) return { title: "Produto não encontrado | Droga Vida Popular" };
  const title = `${product.name} | Droga Vida Popular`;
  const description = [product.brand, product.dosage, product.detail].filter(Boolean).join(" • ");
  const imageUrl = new URL(product.imageUrl, siteOrigin).toString();
  const productUrl = `${siteOrigin}/produto/${product.id}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: productUrl,
      siteName: "Droga Vida Popular",
      locale: "pt_BR",
      images: [{ url: imageUrl, alt: product.name }],
    },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId)) notFound();
  const product = await getPublicProduct(productId);
  if (!product) notFound();

  return (
    <main className="product-page">
      <header className="product-page-header">
        <a href="/" aria-label="Voltar para o início"><img src="/brand/droga-vida-popular-logo.png" alt="Droga Vida Popular" /></a>
        <a href="/#ofertas">← Voltar ao catálogo</a>
      </header>
      <ProductDetailClient product={product} />
      <footer className="product-page-footer">Site desenvolvido por <strong>Erick</strong></footer>
    </main>
  );
}
