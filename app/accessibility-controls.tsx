"use client";

import { useEffect, useState } from "react";

type ZoomLevel = 1 | 1.1 | 1.2;

export default function AccessibilityControls() {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState<ZoomLevel>(1);
  const [highContrast, setHighContrast] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let savedZoom: ZoomLevel = 1;
    let savedHighContrast = false;
    try {
      const saved = JSON.parse(window.localStorage.getItem("droga-vida-accessibility") || "{}") as { zoom?: number; highContrast?: boolean };
      if (saved.zoom === 1 || saved.zoom === 1.1 || saved.zoom === 1.2) savedZoom = saved.zoom;
      savedHighContrast = saved.highContrast === true;
    } catch {
      window.localStorage.removeItem("droga-vida-accessibility");
    }
    const timer = window.setTimeout(() => {
      setZoom(savedZoom);
      setHighContrast(savedHighContrast);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.body.style.zoom = String(zoom);
    document.documentElement.dataset.highContrast = highContrast ? "true" : "false";
    window.localStorage.setItem("droga-vida-accessibility", JSON.stringify({ zoom, highContrast }));
  }, [highContrast, ready, zoom]);

  function reset() {
    setZoom(1);
    setHighContrast(false);
  }

  return (
    <div className="accessibility-control">
      {open && <aside className="accessibility-panel" role="dialog" aria-label="Opções de acessibilidade">
        <div><strong>Acessibilidade</strong><button type="button" onClick={() => setOpen(false)} aria-label="Fechar opções de acessibilidade">×</button></div>
        <fieldset><legend>Tamanho do site</legend><div><button type="button" className={zoom === 1 ? "active" : ""} aria-pressed={zoom === 1} onClick={() => setZoom(1)}>A</button><button type="button" className={zoom === 1.1 ? "active" : ""} aria-pressed={zoom === 1.1} onClick={() => setZoom(1.1)}>A+</button><button type="button" className={zoom === 1.2 ? "active" : ""} aria-pressed={zoom === 1.2} onClick={() => setZoom(1.2)}>A++</button></div></fieldset>
        <label><input type="checkbox" checked={highContrast} onChange={(event) => setHighContrast(event.target.checked)} /><span>Ativar alto contraste</span></label>
        <button className="accessibility-reset" type="button" onClick={reset}>Restaurar padrão</button>
      </aside>}
      <button className="accessibility-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Abrir opções de acessibilidade"><span aria-hidden="true">Aa</span><strong>Acessibilidade</strong></button>
    </div>
  );
}
