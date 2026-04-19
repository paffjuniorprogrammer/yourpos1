import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeLabelProps {
  value: string;
  productName?: string;
  price?: number;
  format?: string;
  width?: number;
  height?: number;
  showLabel?: boolean;
}

export function BarcodeLabel({
  value,
  productName,
  price,
  format = "CODE128",
  width = 2,
  height = 60,
  showLabel = true,
}: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format,
        width,
        height,
        displayValue: showLabel,
        fontSize: 11,
        margin: 6,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // Invalid barcode value — silently ignore
    }
  }, [value, format, width, height, showLabel]);

  if (!value) {
    return (
      <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
        No barcode assigned
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <svg ref={svgRef} className="max-w-full" />
      {productName && (
        <p className="text-[10px] font-semibold text-center text-slate-700 max-w-[160px] truncate">{productName}</p>
      )}
      {price !== undefined && (
        <p className="text-[11px] font-black text-brand-700">{price.toLocaleString()} RWF</p>
      )}
    </div>
  );
}

/** Print a sheet of barcode labels (Avery-style grid) */
export function BarcodePrintSheet({
  items,
}: {
  items: { barcode: string; name: string; price: number }[];
}) {
  return (
    <div
      id="barcode-print-sheet"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "4mm",
        padding: "10mm",
        fontFamily: "monospace",
        background: "#fff",
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #ccc",
            borderRadius: "4px",
            padding: "4mm",
            textAlign: "center",
            pageBreakInside: "avoid",
          }}
        >
          <BarcodeLabel
            value={item.barcode}
            productName={item.name}
            price={item.price}
            height={45}
            width={1.5}
          />
        </div>
      ))}
    </div>
  );
}
